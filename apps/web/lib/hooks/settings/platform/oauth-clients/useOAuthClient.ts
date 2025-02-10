import { useQuery } from "@tanstack/react-query";

import type { ApiSuccessResponse } from "@calcom/platform-types";
import type { PlatformOAuthClient } from "@calcom/prisma/client";

export const useOAuthClient = (clientId?: string) => {
  const {
    isLoading,
    error,
    data: response,
    isFetched,
    isError,
    isFetching,
    isSuccess,
    isFetchedAfterMount,
    refetch,
  } = useQuery<ApiSuccessResponse<PlatformOAuthClient>>({
    queryKey: ["oauth-client", clientId],
    queryFn: () => {
      return fetch(`/api/v2/oauth-clients/${clientId}`, {
        method: "get",
        headers: { "Content-type": "application/json" },
      }).then((res) => res.json());
    },
    enabled: Boolean(clientId),
    staleTime: Infinity,
  });

  return {
    isLoading,
    error,
    data: response?.data,
    isFetched,
    isError,
    isFetching,
    isSuccess,
    isFetchedAfterMount,
    refetch,
  };
};
