import { makeWhereClause } from "@calcom/features/data-table/lib/server";
import { UserRepository } from "@calcom/lib/server/repository/user";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";

import { TRPCError } from "@trpc/server";

import type { TrpcSessionUser } from "../../../trpc";
import type { TListMembersSchema } from "./listMembers.schema";

type GetOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TListMembersSchema;
};

const isAllString = (array: (string | number)[]): array is string[] => {
  return array.every((value) => typeof value === "string");
};
function getUserConditions(oAuthClientId?: string) {
  if (!!oAuthClientId) {
    return {
      platformOAuthClients: {
        some: { id: oAuthClientId },
      },
      isPlatformManaged: true,
    };
  }
  return { isPlatformManaged: false };
}

export const listMembersHandler = async ({ ctx, input }: GetOptions) => {
  const organizationId = ctx.user.organizationId ?? ctx.user.profiles[0].organizationId;
  const searchTerm = input.searchTerm;
  const oAuthClientId = input.oAuthClientId;
  const expand = input.expand;
  const filters = input.filters || [];

  const allAttributeOptions = await prisma.attributeOption.findMany({
    where: {
      attribute: {
        teamId: organizationId,
      },
    },
    orderBy: {
      attribute: {
        name: "asc",
      },
    },
  });

  const groupOptionsWithContainsOptionValues = allAttributeOptions
    .filter((option) => option.isGroup)
    .map((option) => ({
      ...option,
      contains: option.contains.map((optionId) => ({
        id: optionId,
        value: allAttributeOptions.find((o) => o.id === optionId)?.value,
      })),
    }));

  if (!organizationId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User is not part of any organization." });
  }

  if (ctx.user.organization.isPrivate && !ctx.user.organization.isOrgAdmin) {
    return {
      canUserGetMembers: false,
      rows: [],
      meta: {
        totalRowCount: 0,
      },
    };
  }

  const { cursor, limit } = input;

  const getTotalMembers = await prisma.membership.count({
    where: {
      user: {
        ...getUserConditions(oAuthClientId),
      },
      teamId: organizationId,
    },
  });

  let whereClause: Prisma.MembershipWhereInput = {
    user: {
      ...getUserConditions(oAuthClientId),
    },
    teamId: organizationId,
    ...(searchTerm && {
      user: {
        OR: [{ email: { contains: searchTerm } }, { username: { contains: searchTerm } }],
      },
    }),
  };

  filters.forEach((filter) => {
    switch (filter.id) {
      case "role":
        whereClause = {
          ...whereClause,
          ...makeWhereClause({
            columnName: "role",
            filterValue: filter.value,
          }),
        };
        break;
      case "teams":
        whereClause.user = {
          teams: {
            some: {
              team: makeWhereClause({
                columnName: "name",
                filterValue: filter.value,
              }),
            },
          },
        };
        break;
      // We assume that if the filter is not one of the above, it must be an attribute filter
      default:
        if (filter.value.type === "multi_select" && isAllString(filter.value.data)) {
          const attributeOptionValues: string[] = [];
          filter.value.data.forEach((filterValueItem) => {
            attributeOptionValues.push(filterValueItem);
            groupOptionsWithContainsOptionValues.forEach((groupOption) => {
              if (groupOption.contains.find(({ value: containValue }) => containValue === filterValueItem)) {
                attributeOptionValues.push(groupOption.value);
              }
            });
          });

          filter.value.data = attributeOptionValues;
        }

        whereClause.AttributeToUser = {
          some: {
            attributeOption: {
              attribute: {
                id: filter.id,
              },
              ...makeWhereClause({
                columnName: "value",
                filterValue: filter.value,
              }),
            },
          },
        };
        break;
    }
  });

  const teamMembers = await prisma.membership.findMany({
    where: whereClause,
    select: {
      id: true,
      role: true,
      accepted: true,
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          avatarUrl: true,
          timeZone: true,
          disableImpersonation: true,
          completedOnboarding: true,
          lastActiveAt: true,
          teams: {
            select: {
              team: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
    },
    cursor: cursor ? { id: cursor } : undefined,
    take: limit + 1, // We take +1 as itll be used for the next cursor
    orderBy: {
      id: "asc",
    },
  });

  let nextCursor: typeof cursor | undefined = undefined;
  if (teamMembers && teamMembers.length > limit) {
    const nextItem = teamMembers.pop();
    nextCursor = nextItem?.id;
  }

  const members = await Promise.all(
    teamMembers?.map(async (membership) => {
      const user = await UserRepository.enrichUserWithItsProfile({ user: membership.user });
      let attributes;

      if (expand?.includes("attributes")) {
        attributes = await prisma.attributeToUser
          .findMany({
            where: {
              memberId: membership.id,
            },
            select: {
              attributeOption: true,
              weight: true,
            },
            orderBy: {
              attributeOption: {
                attribute: {
                  name: "asc",
                },
              },
            },
          })
          .then((assignedUsers) =>
            assignedUsers.map((au) => ({
              ...au.attributeOption,
              weight: au.weight ?? 100,
            }))
          );
      }

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        profile: user.profile,
        timeZone: user.timeZone,
        role: membership.role,
        accepted: membership.accepted,
        disableImpersonation: user.disableImpersonation,
        completedOnboarding: user.completedOnboarding,
        lastActiveAt: membership.user.lastActiveAt
          ? new Intl.DateTimeFormat(ctx.user.locale, {
              timeZone: ctx.user.timeZone,
            })
              .format(membership.user.lastActiveAt)
              .toLowerCase()
          : null,
        avatarUrl: user.avatarUrl,
        teams: user.teams
          .filter((team) => team.team.id !== organizationId) // In this context we dont want to return the org team
          .map((team) => {
            if (team.team.id === organizationId) return;
            return {
              id: team.team.id,
              name: team.team.name,
              slug: team.team.slug,
            };
          }),
        attributes,
      };
    }) || []
  );

  return {
    rows: members || [],
    nextCursor,
    meta: {
      totalRowCount: getTotalMembers || 0,
    },
  };
};

export default listMembersHandler;
