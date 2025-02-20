import { ApiKeysService } from "@/modules/api-keys/services/api-keys.service";
import { ManagedOrganizationsBillingService } from "@/modules/billing/services/managed-organizations.billing.service";
import { OrganizationsRepository } from "@/modules/organizations/index/organizations.repository";
import { OrganizationsMembershipService } from "@/modules/organizations/memberships/services/organizations-membership.service";
import { CreateOrganizationInput } from "@/modules/organizations/organizations/inputs/create-managed-organization.input";
import { UpdateOrganizationInput } from "@/modules/organizations/organizations/inputs/update-managed-organization.input";
import { ManagedOrganizationsRepository } from "@/modules/organizations/organizations/managed-organizations.repository";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

@Injectable()
export class ManagedOrganizationsService {
  constructor(
    private readonly managedOrganizationsRepository: ManagedOrganizationsRepository,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly managedOrganizationsBillingService: ManagedOrganizationsBillingService,
    private readonly organizationsMembershipService: OrganizationsMembershipService,
    private readonly apiKeysService: ApiKeysService
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

    const organization = await this.managedOrganizationsRepository.createManagedOrganization(
      managerOrganizationId,
      { ...organizationInput, isOrganization: true, isPlatform: true }
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

    const apiKey = await this.apiKeysService.createApiKey(authUserId, {
      apiKeyDaysValid: organizationInput.apiKeyDaysValid,
      apiKeyNeverExpires: organizationInput.apiKeyNeverExpires,
      note: `Managed organization API key. ManagerOrgId: ${managerOrganizationId}. ManagedOrgId: ${organization.id}`,
      teamId: organization.id,
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

  async getManagedOrganization(managedOrganizationId: number) {
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

  async updateManagedOrganization(managedOrganizationId: number, body: UpdateOrganizationInput) {
    return await this.organizationsRepository.update(managedOrganizationId, body);
  }

  async deleteManagedOrganization(managedOrganizationId: number) {
    return await this.organizationsRepository.delete(managedOrganizationId);
  }
}
