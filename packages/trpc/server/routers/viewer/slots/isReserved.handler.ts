import type { NextApiRequest } from "next";

import type { PrismaClient } from "@calcom/prisma";

import type { TIsReservedInputSchema } from "./isReserved.schema";

interface IsReservedOptions {
  ctx: {
    prisma: PrismaClient;
    req?: NextApiRequest | undefined;
  };
  input: TIsReservedInputSchema;
}

export const isReservedHandler = async ({ ctx, input }: IsReservedOptions) => {
  const { prisma, req } = ctx;
  const uid = req?.cookies?.uid;
  const { slotUtcStartDate, slotUtcEndDate, eventTypeId } = input;

  const reservedBySomeoneElse = await prisma.selectedSlots.findFirst({
    where: {
      slotUtcStartDate,
      slotUtcEndDate,
      eventTypeId,
      uid: { not: uid }, // Exclude current user's reservation
      releaseAt: { gt: new Date() }, // Only consider non-expired reservations
    },
  });

  return {
    isReserved: !!reservedBySomeoneElse,
  };
};
