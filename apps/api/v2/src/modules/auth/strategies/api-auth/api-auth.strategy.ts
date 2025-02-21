import { hashAPIKey, isApiKey, stripApiKey } from "@/lib/api-key";
import { AuthMethods } from "@/lib/enums/auth-methods";
import { isOriginAllowed } from "@/lib/is-origin-allowed/is-origin-allowed";
import { BaseStrategy } from "@/lib/passport/strategies/types";
import { ApiKeysRepository } from "@/modules/api-keys/api-keys-repository";
import { DeploymentsService } from "@/modules/deployments/deployments.service";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { OAuthFlowService } from "@/modules/oauth-clients/services/oauth-flow.service";
import { ProfilesRepository } from "@/modules/profiles/profiles.repository";
import { TokensRepository } from "@/modules/tokens/tokens.repository";
import { UsersService } from "@/modules/users/services/users.service";
import { UserWithProfile, UsersRepository } from "@/modules/users/users.repository";
import { Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { getToken } from "next-auth/jwt";

import { INVALID_ACCESS_TOKEN, X_CAL_CLIENT_ID, X_CAL_SECRET_KEY } from "@calcom/platform-constants";

export type ApiAuthGuardUser = UserWithProfile & { isSystemAdmin: boolean };
export type ApiAuthGuardRequest = Request & { authMethod: AuthMethods; organizationId: number | null };
@Injectable()
export class ApiAuthStrategy extends PassportStrategy(BaseStrategy, "api-auth") {
  constructor(
    private readonly deploymentsService: DeploymentsService,
    private readonly config: ConfigService,
    private readonly oauthFlowService: OAuthFlowService,
    private readonly tokensRepository: TokensRepository,
    private readonly userRepository: UsersRepository,
    private readonly apiKeyRepository: ApiKeysRepository,
    private readonly oauthRepository: OAuthClientRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly usersService: UsersService
  ) {
    super();
  }

  async authenticate(request: ApiAuthGuardRequest) {
    try {
      const { params } = request;
      const oAuthClientSecret = request.get(X_CAL_SECRET_KEY);
      const oAuthClientId = params.clientId || request.get(X_CAL_CLIENT_ID);
      const bearerToken = request.get("Authorization")?.replace("Bearer ", "");

      if (oAuthClientId && oAuthClientSecret) {
        request.authMethod = AuthMethods["OAUTH_CLIENT"];
        return await this.authenticateOAuthClient(oAuthClientId, oAuthClientSecret, request);
      }

      if (bearerToken) {
        const requestOrigin = request.get("Origin");
        request.authMethod = isApiKey(bearerToken, this.config.get<string>("api.apiKeyPrefix") ?? "cal_")
          ? AuthMethods["API_KEY"]
          : AuthMethods["ACCESS_TOKEN"];
        return await this.authenticateBearerToken(bearerToken, request, requestOrigin);
      }

      const nextAuthSecret = this.config.get("next.authSecret", { infer: true });
      const nextAuthToken = await getToken({ req: request, secret: nextAuthSecret });

      if (nextAuthToken) {
        request.authMethod = AuthMethods["NEXT_AUTH"];
        return await this.authenticateNextAuth(nextAuthToken, request);
      }

      throw new UnauthorizedException(
        "No authentication method provided. Either pass an API key as 'Bearer' header or OAuth client credentials as 'x-cal-secret-key' and 'x-cal-client-id' headers"
      );
    } catch (err) {
      if (err instanceof Error) {
        return this.error(err);
      }
      return this.error(
        new InternalServerErrorException("An error occurred while authenticating the request")
      );
    }
  }

  async authenticateNextAuth(token: { email?: string | null }, request: ApiAuthGuardRequest) {
    const user = await this.nextAuthStrategy(token, request);
    return this.success(this.getSuccessUser(user));
  }

  getSuccessUser(user: UserWithProfile): ApiAuthGuardUser {
    return {
      ...user,
      isSystemAdmin: user.role === "ADMIN",
    };
  }

  async authenticateOAuthClient(
    oAuthClientId: string,
    oAuthClientSecret: string,
    request: ApiAuthGuardRequest
  ) {
    const user = await this.oAuthClientStrategy(oAuthClientId, oAuthClientSecret, request);
    return this.success(this.getSuccessUser(user));
  }

  async oAuthClientStrategy(oAuthClientId: string, oAuthClientSecret: string, request: ApiAuthGuardRequest) {
    const client = await this.oauthRepository.getOAuthClient(oAuthClientId);

    if (!client) {
      throw new UnauthorizedException(`Client with ID ${oAuthClientId} not found`);
    }

    if (client.secret !== oAuthClientSecret) {
      throw new UnauthorizedException("Invalid client secret");
    }

    const platformCreatorId = await this.profilesRepository.getPlatformOwnerUserId(client.organizationId);

    if (!platformCreatorId) {
      throw new UnauthorizedException("No owner ID found for this OAuth client");
    }

    const user = await this.userRepository.findByIdWithProfile(platformCreatorId);

    if (!user) {
      throw new UnauthorizedException("No user associated with the provided OAuth client");
    }

    request.organizationId = client.organizationId;

    return user;
  }

  async authenticateBearerToken(
    authString: string,
    request: ApiAuthGuardRequest,
    requestOrigin: string | undefined
  ) {
    try {
      const user = isApiKey(authString, this.config.get<string>("api.apiKeyPrefix") ?? "cal_")
        ? await this.apiKeyStrategy(authString, request)
        : await this.accessTokenStrategy(authString, request, requestOrigin);

      if (!user) {
        return this.error(new UnauthorizedException("No user associated with the provided token"));
      }

      return this.success(this.getSuccessUser(user));
    } catch (err) {
      if (err instanceof Error) {
        return this.error(err);
      }
      return this.error(
        new InternalServerErrorException("An error occurred while authenticating the request")
      );
    }
  }

  async apiKeyStrategy(apiKey: string, request: ApiAuthGuardRequest) {
    const isLicenseValid = await this.deploymentsService.checkLicense();
    if (!isLicenseValid) {
      throw new UnauthorizedException("Invalid or missing CALCOM_LICENSE_KEY environment variable");
    }
    const strippedApiKey = stripApiKey(apiKey, this.config.get<string>("api.keyPrefix"));
    const apiKeyHash = hashAPIKey(strippedApiKey);
    const keyData = await this.apiKeyRepository.getApiKeyFromHash(apiKeyHash);
    if (!keyData) {
      throw new UnauthorizedException("Your api key is not valid");
    }

    const isKeyExpired =
      keyData.expiresAt && new Date().setHours(0, 0, 0, 0) > keyData.expiresAt.setHours(0, 0, 0, 0);
    if (isKeyExpired) {
      throw new UnauthorizedException("Your api key is expired");
    }

    const apiKeyOwnerId = keyData.userId;
    if (!apiKeyOwnerId) {
      throw new UnauthorizedException("No user tied to this apiKey");
    }

    const user: UserWithProfile | null = await this.userRepository.findByIdWithProfile(apiKeyOwnerId);
    request.organizationId = keyData.teamId;

    return user;
  }

  async accessTokenStrategy(accessToken: string, request: ApiAuthGuardRequest, origin?: string) {
    const accessTokenValid = await this.oauthFlowService.validateAccessToken(accessToken);
    if (!accessTokenValid) {
      throw new UnauthorizedException(INVALID_ACCESS_TOKEN);
    }

    const client = await this.tokensRepository.getAccessTokenClient(accessToken);
    if (!client) {
      throw new UnauthorizedException("OAuth client not found given the access token");
    }

    if (origin && !isOriginAllowed(origin, client.redirectUris)) {
      throw new UnauthorizedException(
        `Invalid request origin - please open https://app.cal.com/settings/platform and add the origin '${origin}' to the 'Redirect uris' of your OAuth client with ID '${client.id}'`
      );
    }

    const ownerId = await this.tokensRepository.getAccessTokenOwnerId(accessToken);

    if (!ownerId) {
      throw new UnauthorizedException(INVALID_ACCESS_TOKEN);
    }

    const user: UserWithProfile | null = await this.userRepository.findByIdWithProfile(ownerId);
    if (!user) {
      throw new UnauthorizedException("User associated with the authentication api key not found.");
    }

    const organizationId = this.usersService.getUserMainOrgId(user) as number;
    request.organizationId = organizationId;

    return user;
  }

  async nextAuthStrategy(token: { email?: string | null }, request: ApiAuthGuardRequest) {
    if (!token.email) {
      throw new UnauthorizedException("Email not found in the authentication token.");
    }

    const user = await this.userRepository.findByEmailWithProfile(token.email);
    if (!user) {
      throw new UnauthorizedException("User associated with the authentication token email not found.");
    }
    const organizationId = this.usersService.getUserMainOrgId(user) as number;
    request.organizationId = organizationId;

    return user;
  }
}
