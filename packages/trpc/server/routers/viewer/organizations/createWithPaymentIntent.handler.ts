import { StripeBillingService } from "@calcom/features/ee/billing/stripe-billling-service";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { prisma } from "@calcom/prisma";

import { TRPCError } from "@trpc/server";

import type { TrpcSessionUser } from "../../../trpc";
import type { TCreateWithPaymentIntentInputSchema } from "./createWithPaymentIntent.schema";

type CreateOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TCreateWithPaymentIntentInputSchema;
};

function hasPermissionToCreateForEmail(user: CreateOptions["ctx"]["user"], targetEmail: string) {
  if (user.role === "ADMIN" || user.impersonatedBy?.role === "ADMIN") {
    return true;
  }
  return user.email === targetEmail;
}

function hasPendingOrganizations(user: CreateOptions["ctx"]["user"]) {
  if (user.role === "ADMIN" || user.impersonatedBy?.role === "ADMIN") {
    return false;
  }

  const pendingOrganizations = prisma.organizationOnboarding.findFirst({
    where: {
      orgOwnerEmail: user.email,
      isComplete: false,
    },
  });

  return pendingOrganizations;
}

function hasPermissionToModifyDefaultPayment(user: CreateOptions["ctx"]["user"]) {
  return user.role === "ADMIN" || user.impersonatedBy?.role === "ADMIN";
}

function hasModifiedDefaultPayment(input: CreateOptions["input"]) {
  return (
    (input.billingPeriod !== undefined && input.billingPeriod !== "MONTHLY") ||
    (input.seats !== undefined && input.seats !== ORGANIZATION_SELF_SERVE_MIN_SEATS) ||
    (input.pricePerSeat !== undefined && input.pricePerSeat !== ORGANIZATION_SELF_SERVE_PRICE)
  );
}

export const createHandler = async ({ input, ctx }: CreateOptions) => {
  const { name, slug, orgOwnerEmail, seats, pricePerSeat, billingPeriod } = input;

  if (!hasPermissionToCreateForEmail(ctx.user, orgOwnerEmail)) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  if (await hasPendingOrganizations(ctx.user)) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You have an existing pending organization. Please complete it before creating a new one.",
    });
  }

  const shouldCreateCustomPrice =
    hasPermissionToModifyDefaultPayment(ctx.user) && hasModifiedDefaultPayment(input);
  if (!hasPermissionToModifyDefaultPayment(ctx.user) && hasModifiedDefaultPayment(input)) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You do not have permission to modify the default payment settings",
    });
  }

  const billingService = new StripeBillingService();

  // Create or get Stripe customer
  let stripeCustomerId: string;
  const existingCustomer = await prisma.user.findUnique({
    where: { email: orgOwnerEmail },
    select: { stripeCustomerId: true },
  });

  if (existingCustomer?.stripeCustomerId) {
    stripeCustomerId = existingCustomer.stripeCustomerId;
  } else {
    const customer = await billingService.createCustomer({
      email: orgOwnerEmail,
      metadata: {
        email: orgOwnerEmail,
      },
    });
    stripeCustomerId = customer.stripeCustomerId;
  }

  // Create organization onboarding entry
  const organizationOnboarding = await prisma.organizationOnboarding.create({
    data: {
      name,
      slug,
      orgOwnerEmail,
      billingPeriod: billingPeriod || "MONTHLY",
      seats: seats || ORGANIZATION_SELF_SERVE_MIN_SEATS,
      pricePerSeat: pricePerSeat || ORGANIZATION_SELF_SERVE_PRICE,
      stripeCustomerId,
    },
  });

  // Get or create price ID
  let priceId: string;
  if (shouldCreateCustomPrice) {
    const customPrice = await billingService.createPrice({
      amount: (pricePerSeat || ORGANIZATION_SELF_SERVE_PRICE) * 100, // convert to cents
      currency: "usd",
      interval: (billingPeriod || "MONTHLY").toLowerCase() as "month" | "year",
      nickname: `Custom Organization Price - ${pricePerSeat} per seat`,
      metadata: {
        organizationOnboardingId: organizationOnboarding.id,
        pricePerSeat: pricePerSeat || ORGANIZATION_SELF_SERVE_PRICE,
        billingPeriod: billingPeriod || "MONTHLY",
      },
    });
    priceId = customPrice.priceId;
  } else {
    priceId = process.env.STRIPE_ORG_MONTHLY_PRICE_ID!;
  }

  // Create subscription checkout
  const subscription = await billingService.createSubscriptionCheckout({
    customerId: stripeCustomerId,
    successUrl: `${WEBAPP_URL}/organizations/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${WEBAPP_URL}/organizations/cancel?session_id={CHECKOUT_SESSION_ID}`,
    priceId,
    quantity: seats || ORGANIZATION_SELF_SERVE_MIN_SEATS,
    metadata: {
      organizationOnboardingId: organizationOnboarding.id,
      seats: seats || ORGANIZATION_SELF_SERVE_MIN_SEATS,
      pricePerSeat: pricePerSeat || ORGANIZATION_SELF_SERVE_PRICE,
      billingPeriod: billingPeriod || "MONTHLY",
    },
  });

  // Update organization onboarding with session ID
  await prisma.organizationOnboarding.update({
    where: { id: organizationOnboarding.id },
    data: { stripeCustomerId },
  });

  return {
    organizationOnboarding,
    checkoutUrl: subscription.checkoutUrl,
    sessionId: subscription.sessionId,
  };
};

export default createHandler;
