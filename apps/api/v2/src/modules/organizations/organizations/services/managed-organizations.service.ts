import { ApiKeyRepository } from "@/modules/api-key/api-key-repository";
import { ManagedOrganizationsBillingService } from "@/modules/billing/services/managed-organizations.billing.service";
import { OrganizationsRepository } from "@/modules/organizations/index/organizations.repository";
import { OrganizationsMembershipService } from "@/modules/organizations/memberships/services/organizations-membership.service";
import { CreateOrganizationInput } from "@/modules/organizations/organizations/inputs/create-organization.input";
import { ManagedOrganizationsRepository } from "@/modules/organizations/organizations/managed-organizations.repository";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import { createApiKeyHandler } from "@calcom/platform-libraries";

@Injectable()
export class ManagedOrganizationsService {
  constructor(
    private readonly managedOrganizationsRepository: ManagedOrganizationsRepository,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly managedOrganizationsBillingService: ManagedOrganizationsBillingService,
    private readonly organizationsMembershipService: OrganizationsMembershipService,
    private readonly apiKeysRepository: ApiKeyRepository
  ) {}

  async createManagedOrganization(
    authUserId: number,
    managerOrganizationId: number,
    organizationInput: CreateOrganizationInput
  ) {
    const isManagerOrganizationPlatform = await this.isManagerOrganizationPlatform(managerOrganizationId);
    if (!isManagerOrganizationPlatform) {
      throw new ForbiddenException(
        "Manager organization must be a platform organization. Normal organizations can't create managed organizations yet."
      );
    }

    const isOrganization = true;
    const isPlatform = true;
    const organization = await this.managedOrganizationsRepository.createManagedOrganization(
      managerOrganizationId,
      { ...organizationInput, isOrganization, isPlatform }
    );

    await this.organizationsMembershipService.createOrgMembership(organization.id, {
      userId: authUserId,
      accepted: true,
      role: "OWNER",
    });

    await this.managedOrganizationsBillingService.createManagedOrganizationBilling(
      managerOrganizationId,
      organization.id
    );

    const apiKey = await createApiKeyHandler({
      ctx: {
        user: {
          id: authUserId,
        },
      },
      input: {
        note: `Managed organization API key. ManagerOrgId: ${managerOrganizationId}. ManagedOrgId: ${organization.id}`,
        neverExpires: true,
        teamId: organization.id,
      },
    });

    return {
      ...organization,
      apiKey,
    };
  }

  private async isManagerOrganizationPlatform(managerOrganizationId: number) {
    const organization = await this.organizationsRepository.findById(managerOrganizationId);
    return !!organization?.isPlatform;
  }

  async getManagedOrganization(managerOrganizationId: number, managedOrganizationId: number) {
    const managedOrganization = await this.managedOrganizationsRepository.getByManagerManagedIds(
      managerOrganizationId,
      managedOrganizationId
    );
    if (!managedOrganization) {
      throw new NotFoundException(
        `Manager organization with id=${managerOrganizationId} does not have a managed organization with id=${managedOrganizationId}.`
      );
    }
    const organization = await this.organizationsRepository.findById(managedOrganizationId);
    if (!organization) {
      throw new NotFoundException(`Managed organization with id=${managedOrganizationId} does not exist.`);
    }
    return organization;
  }

  async getManagedOrganizations(managerOrganizationId: number) {
    const managedOrganizations = await this.managedOrganizationsRepository.getByManagerOrganizationId(
      managerOrganizationId
    );
    const managedOrganizationsIds = managedOrganizations.map(
      (managedOrganization) => managedOrganization.managedOrganizationId
    );

    return await this.organizationsRepository.findByIds(managedOrganizationsIds);
  }
}
