import { ApiKeyType } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";

import _metadataZapier from "@calcom/app-store/zapierother/_metadata";

import { getSession } from "@lib/auth";
import prisma from "@lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "DELETE"].includes(req.method!)) {
    return res.status(405).end();
  }

  // Check that user is authenticated
  const session = await getSession({ req });

  if (!session) {
    res.status(401).json({ message: "You must be logged in to do this" });
    return;
  }

  if (req.method === "GET") {
    const credentials = await prisma.credential.findMany({
      where: {
        userId: session.user?.id,
      },
      select: {
        type: true,
      },
    });

    res.status(200).json(credentials);
  }

  if (req.method == "DELETE") {
    const id = req.body.id;

    const integration = await prisma.credential.findFirst({
      where: {
        id,
      },
    });

    await prisma.user.update({
      where: {
        id: session?.user?.id,
      },
      data: {
        credentials: {
          delete: {
            id,
          },
        },
      },
    });

    if (integration?.type === _metadataZapier.type) {
      const apiKeyToDelete = await prisma.apiKey.findFirst({
        where: {
          userId: session?.user?.id,
          apiKeyType: ApiKeyType.ZAPIER,
        },
      });

      await prisma.apiKey.delete({
        where: {
          id: apiKeyToDelete?.id,
        },
      });
    }

    res.status(200).json({ message: "Integration deleted successfully" });
  }
}
