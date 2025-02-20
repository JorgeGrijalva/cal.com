import { expect } from "@playwright/test";

import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";

import { createTeamEventType } from "./fixtures/users";
import type { Fixtures } from "./lib/fixtures";
import { test } from "./lib/fixtures";
import { localize, setupManagedEvent } from "./lib/testUtils";

test.afterEach(({ users }) => users.deleteAll());

test.describe("Bookings", () => {
  test.describe("Upcoming bookings", () => {
    test("show attendee bookings and organizer bookings in asc order by startDate", async ({
      page,
      users,
      bookings,
    }) => {
      const firstUser = await users.create();
      const secondUser = await users.create();

      const bookingWhereFirstUserIsOrganizerFixture = await createBooking({
        title: "Booking as organizer",
        bookingsFixture: bookings,
        // Create a booking 3 days from today
        relativeDate: 3,
        organizer: firstUser,
        organizerEventType: firstUser.eventTypes[0],
        attendees: [
          { name: "First", email: "first@cal.com", timeZone: "Europe/Berlin" },
          { name: "Second", email: "second@cal.com", timeZone: "Europe/Berlin" },
          { name: "Third", email: "third@cal.com", timeZone: "Europe/Berlin" },
        ],
      });
      const bookingWhereFirstUserIsOrganizer = await bookingWhereFirstUserIsOrganizerFixture.self();

      const bookingWhereFirstUserIsAttendeeFixture = await createBooking({
        title: "Booking as attendee",
        bookingsFixture: bookings,
        organizer: secondUser,
        // Booking created 2 days from today
        relativeDate: 2,
        organizerEventType: secondUser.eventTypes[0],
        attendees: [
          { name: "OrganizerAsBooker", email: firstUser.email, timeZone: "Europe/Berlin" },
          { name: "Second", email: "second@cal.com", timeZone: "Europe/Berlin" },
          { name: "Third", email: "third@cal.com", timeZone: "Europe/Berlin" },
        ],
      });
      const bookingWhereFirstUserIsAttendee = await bookingWhereFirstUserIsAttendeeFixture.self();

      await firstUser.apiLogin();
      await page.goto(`/bookings/upcoming`);
      const upcomingBookings = page.locator('[data-testid="upcoming-bookings"]');
      const firstUpcomingBooking = upcomingBookings.locator('[data-testid="booking-item"]').nth(0);
      const secondUpcomingBooking = upcomingBookings.locator('[data-testid="booking-item"]').nth(1);
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        firstUpcomingBooking.locator(`text=${bookingWhereFirstUserIsAttendee!.title}`)
      ).toBeVisible();
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        secondUpcomingBooking.locator(`text=${bookingWhereFirstUserIsOrganizer!.title}`)
      ).toBeVisible();
    });
  });
  test.describe("Past bookings", () => {
    test("Mark first guest as no-show", async ({ page, users, bookings, webhooks }) => {
      const firstUser = await users.create();
      const secondUser = await users.create();

      const bookingWhereFirstUserIsOrganizerFixture = await createBooking({
        title: "Booking as organizer",
        bookingsFixture: bookings,
        // Create a booking 3 days ago
        relativeDate: -3,
        organizer: firstUser,
        organizerEventType: firstUser.eventTypes[0],
        attendees: [
          { name: "First", email: "first@cal.com", timeZone: "Europe/Berlin" },
          { name: "Second", email: "second@cal.com", timeZone: "Europe/Berlin" },
          { name: "Third", email: "third@cal.com", timeZone: "Europe/Berlin" },
        ],
      });
      const bookingWhereFirstUserIsOrganizer = await bookingWhereFirstUserIsOrganizerFixture.self();
      await firstUser.apiLogin();
      const webhookReceiver = await webhooks.createReceiver();
      await page.goto(`/bookings/past`);
      const pastBookings = page.locator('[data-testid="past-bookings"]');
      const firstPastBooking = pastBookings.locator('[data-testid="booking-item"]').nth(0);
      const titleAndAttendees = firstPastBooking.locator('[data-testid="title-and-attendees"]');
      const firstGuest = firstPastBooking.locator('[data-testid="guest"]').nth(0);
      await firstGuest.click();
      await expect(page.locator('[data-testid="unmark-no-show"]')).toBeHidden();
      await expect(page.locator('[data-testid="mark-no-show"]')).toBeVisible();
      await page.locator('[data-testid="mark-no-show"]').click();
      await firstGuest.click();
      await expect(page.locator('[data-testid="unmark-no-show"]')).toBeVisible();
      await expect(page.locator('[data-testid="mark-no-show"]')).toBeHidden();
      await webhookReceiver.waitForRequestCount(1);
      const [request] = webhookReceiver.requestList;
      const body = request.body;
      // remove dynamic properties that differs depending on where you run the tests
      const dynamic = "[redacted/dynamic]";
      // @ts-expect-error we are modifying the object
      body.createdAt = dynamic;
      expect(body).toMatchObject({
        triggerEvent: "BOOKING_NO_SHOW_UPDATED",
        createdAt: "[redacted/dynamic]",
        payload: {
          message: "first@cal.com marked as no-show",
          attendees: [{ email: "first@cal.com", noShow: true }],
          bookingUid: bookingWhereFirstUserIsOrganizer?.uid,
          bookingId: bookingWhereFirstUserIsOrganizer?.id,
        },
      });
      webhookReceiver.close();
    });
    test("Mark 3rd attendee as no-show", async ({ page, users, bookings }) => {
      const firstUser = await users.create();
      const secondUser = await users.create();

      const bookingWhereFirstUserIsOrganizerFixture = await createBooking({
        title: "Booking as organizer",
        bookingsFixture: bookings,
        // Create a booking 4 days ago
        relativeDate: -4,
        organizer: firstUser,
        organizerEventType: firstUser.eventTypes[0],
        attendees: [
          { name: "First", email: "first@cal.com", timeZone: "Europe/Berlin" },
          { name: "Second", email: "second@cal.com", timeZone: "Europe/Berlin" },
          { name: "Third", email: "third@cal.com", timeZone: "Europe/Berlin" },
          { name: "Fourth", email: "fourth@cal.com", timeZone: "Europe/Berlin" },
        ],
      });
      const bookingWhereFirstUserIsOrganizer = await bookingWhereFirstUserIsOrganizerFixture.self();

      await firstUser.apiLogin();
      await page.goto(`/bookings/past`);
      const pastBookings = page.locator('[data-testid="past-bookings"]');
      const firstPastBooking = pastBookings.locator('[data-testid="booking-item"]').nth(0);
      const titleAndAttendees = firstPastBooking.locator('[data-testid="title-and-attendees"]');
      const moreGuests = firstPastBooking.locator('[data-testid="more-guests"]');
      await moreGuests.click();
      const firstGuestInMore = page.getByRole("menuitemcheckbox").nth(0);
      await expect(firstGuestInMore).toBeChecked({ checked: false });
      await firstGuestInMore.click();
      await expect(firstGuestInMore).toBeChecked({ checked: true });
      const updateNoShow = firstPastBooking.locator('[data-testid="update-no-show"]');
      await updateNoShow.click();
      await moreGuests.click();
      await expect(firstGuestInMore).toBeChecked({ checked: true });
    });
    test("Team admin/owner can mark first attendee as no-show", async ({
      page,
      users,
      bookings,
      webhooks,
    }) => {
      const { adminUser, memberUser, managedEvent } = await setupManagedEvent({ users });

      const bookingFixture = await createBooking({
        title: "Managed Event Booking",
        bookingsFixture: bookings,
        // Create a booking 3 days ago
        relativeDate: -3,
        organizer: memberUser,
        organizerEventType: managedEvent,
        attendees: [
          { name: "First Guest", email: "first@cal.com", timeZone: "Europe/Berlin" },
          { name: "Second Guest", email: "second@cal.com", timeZone: "Europe/Berlin" },
          { name: "Third Guest", email: "third@cal.com", timeZone: "Europe/Berlin" },
        ],
      });
      const booking = await bookingFixture.self();
      await adminUser.apiLogin();
      const { webhookReceiver, teamId } = await webhooks.createTeamReceiver();
      await page.goto(`/bookings/past`);
      const pastBookings = page.locator('[data-testid="past-bookings"]');
      const firstPastBooking = pastBookings.locator('[data-testid="booking-item"]').nth(0);
      const titleAndAttendees = firstPastBooking.locator('[data-testid="title-and-attendees"]');
      const firstGuest = firstPastBooking.locator('[data-testid="guest"]').nth(0);
      await firstGuest.click();
      await expect(page.locator('[data-testid="mark-no-show"]')).toBeVisible();
      await page.locator('[data-testid="mark-no-show"]').click();
      await firstGuest.click();
      await expect(page.locator('[data-testid="unmark-no-show"]')).toBeVisible();
      await expect(page.locator('[data-testid="mark-no-show"]')).toBeHidden();
      await webhookReceiver.waitForRequestCount(1);
      const [request] = webhookReceiver.requestList;
      const body = request.body;
      const dynamic = "[redacted/dynamic]";
      // @ts-expect-error we are modifying the object
      body.createdAt = dynamic;
      expect(body).toMatchObject({
        triggerEvent: "BOOKING_NO_SHOW_UPDATED",
        createdAt: "[redacted/dynamic]",
        payload: {
          message: "first@cal.com marked as no-show",
          attendees: [{ email: "first@cal.com", noShow: true }],
          bookingUid: booking?.uid,
          bookingId: booking?.id,
        },
      });

      // Close webhook receiver
      webhookReceiver.close();
    });
  });
  test("Admin bookings filtered by default", async ({ page, users, bookings }) => {
    const t = await localize("en");
    const firstUser = await users.create(
      { name: "First", email: "first@cal.com" },
      {
        hasTeam: true,
        teamRole: MembershipRole.ADMIN,
      }
    );
    const teamId = (await firstUser.getFirstTeamMembership()).teamId;
    const secondUser = await users.create({ name: "Second", email: "second@cal.com" });
    const thirdUser = await users.create({ name: "Third", email: "third@cal.com" });
    // Add teammates to the team
    await prisma.membership.createMany({
      data: [
        {
          teamId: teamId,
          userId: secondUser.id,
          role: MembershipRole.MEMBER,
          accepted: true,
        },
        {
          teamId: teamId,
          userId: thirdUser.id,
          role: MembershipRole.MEMBER,
          accepted: true,
        },
      ],
    });

    //Create a single booking for FirstUser(admin)
    const firstUserBookingFixture = await createBooking({
      title: "FirstUser as Organizer Meeting",
      bookingsFixture: bookings,
      relativeDate: 3,
      organizer: firstUser,
      organizerEventType: firstUser.eventTypes[0],
      attendees: [
        { name: "Second", email: secondUser.email, timeZone: "Europe/Berlin" },
        { name: "Third", email: thirdUser.email, timeZone: "Europe/Berlin" },
      ],
    });
    const firstUserBooking = await firstUserBookingFixture.self();

    //Create 2 bookings for SecondUser
    await createBooking({
      title: "SecondUser as Organizer Meeting 1",
      bookingsFixture: bookings,
      organizer: secondUser,
      relativeDate: 2,
      organizerEventType: secondUser.eventTypes[0],
      attendees: [
        { name: "First", email: firstUser.email, timeZone: "Europe/Berlin" },
        { name: "Third", email: thirdUser.email, timeZone: "Europe/Berlin" },
      ],
    });
    await createBooking({
      title: "SecondUser as Organizer Meeting 2",
      bookingsFixture: bookings,
      organizer: secondUser,
      relativeDate: 4,
      organizerEventType: secondUser.eventTypes[0],
      attendees: [
        { name: "First", email: firstUser.email, timeZone: "Europe/Berlin" },
        { name: "Third", email: thirdUser.email, timeZone: "Europe/Berlin" },
      ],
    });

    //admin login
    await firstUser.apiLogin();
    await Promise.all([
      page.waitForResponse((response) => /\/api\/trpc\/bookings\/get.*/.test(response.url())),
      page.waitForResponse((response) => /\/api\/trpc\/bookings\/get.*/.test(response.url())),
      page.goto(`/bookings/upcoming`),
      page.waitForTimeout(10000),
      page.waitForURL(`**\/upcoming?status=upcoming&userIds=${firstUser.id}`),
    ]);

    //expect only 1 booking (of admin) to be shown in list due to default filtering for admin
    const upcomingBookingsTable = page.locator('[data-testid="upcoming-bookings"]');
    const bookingListItems = upcomingBookingsTable.locator('[data-testid="booking-item"]');
    const bookingListCount = await bookingListItems.count();
    expect(bookingListCount).toBe(1);
    const firstUpcomingBooking = bookingListItems.nth(0);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      firstUpcomingBooking.locator(`text=${firstUserBooking!.title}`)
    ).toBeVisible();
  });

  test("People filter includes bookings where filtered person is attendee", async ({
    page,
    users,
    bookings,
  }) => {
    const firstUser = await users.create(
      { name: "First", email: "first@cal.com" },
      {
        hasTeam: true,
        teamRole: MembershipRole.ADMIN,
      }
    );
    const teamId = (await firstUser.getFirstTeamMembership()).teamId;
    const secondUser = await users.create({ name: "Second", email: "second@cal.com" });
    const thirdUser = await users.create({ name: "Third", email: "third@cal.com" });
    // Add teammates to the team
    await prisma.membership.createMany({
      data: [
        {
          teamId: teamId,
          userId: secondUser.id,
          role: MembershipRole.MEMBER,
          accepted: true,
        },
        {
          teamId: teamId,
          userId: thirdUser.id,
          role: MembershipRole.MEMBER,
          accepted: true,
        },
      ],
    });
    const teamEvent = await createTeamEventType(
      { id: firstUser.id },
      { id: teamId },
      { teamEventSlug: "team-event-slug" }
    );

    //Create a TeamEventType booking where ThirdUser is attendee
    const thirdUserAttendeeTeamEventBookingFixture = await createBooking({
      title: "ThirdUser is Attendee for TeamEvent",
      bookingsFixture: bookings,
      relativeDate: 6,
      organizer: firstUser,
      organizerEventType: teamEvent,
      attendees: [{ name: "Third", email: thirdUser.email, timeZone: "Europe/Berlin" }],
    });
    const thirdUserAttendeeTeamEvent = await thirdUserAttendeeTeamEventBookingFixture.self();

    //Create a IndividualEventType booking where ThirdUser,SecondUser are attendees and FirstUser is organizer
    const thirdUserAttendeeIndividualBookingFixture = await createBooking({
      title: "ThirdUser is Attendee and FirstUser is Organizer",
      bookingsFixture: bookings,
      relativeDate: 3,
      organizer: firstUser,
      organizerEventType: firstUser.eventTypes[0],
      attendees: [
        { name: "Third", email: thirdUser.email, timeZone: "Europe/Berlin" },
        { name: "Second", email: secondUser.email, timeZone: "Europe/Berlin" },
      ],
    });
    const thirdUserAttendeeIndividualBooking = await thirdUserAttendeeIndividualBookingFixture.self();

    //Create a IndividualEventType booking where ThirdUser is organizer and FirstUser,SecondUser are attendees
    const thirdUserOrganizerBookingFixture = await createBooking({
      title: "ThirdUser is Organizer and FirstUser is Attendee",
      bookingsFixture: bookings,
      organizer: thirdUser,
      relativeDate: 2,
      organizerEventType: thirdUser.eventTypes[0],
      attendees: [
        { name: "First", email: firstUser.email, timeZone: "Europe/Berlin" },
        { name: "Second", email: secondUser.email, timeZone: "Europe/Berlin" },
      ],
    });
    const thirdUserOrganizerBooking = await thirdUserOrganizerBookingFixture.self();

    //Create a booking where FirstUser is organizer and SecondUser is attendee
    await createBooking({
      title: "FirstUser is Organizer and SecondUser is Attendee",
      bookingsFixture: bookings,
      organizer: firstUser,
      relativeDate: 4,
      organizerEventType: firstUser.eventTypes[0],
      attendees: [{ name: "Second", email: secondUser.email, timeZone: "Europe/Berlin" }],
    });

    //admin login
    //Select 'ThirdUser' in people filter
    await firstUser.apiLogin();
    await Promise.all([
      page.waitForResponse((response) => /\/api\/trpc\/bookings\/get.*/.test(response.url())),
      page.waitForResponse((response) => /\/api\/trpc\/bookings\/get.*/.test(response.url())),
      page.goto(`/bookings/upcoming?status=upcoming&userIds=${thirdUser.id}`),
    ]);

    //expect only 3 bookings (out of 4 total) to be shown in list.
    //where ThirdUser is either organizer or attendee
    const upcomingBookingsTable = page.locator('[data-testid="upcoming-bookings"]');
    const bookingListItems = upcomingBookingsTable.locator('[data-testid="booking-item"]');
    const bookingListCount = await bookingListItems.count();
    expect(bookingListCount).toBe(3);

    //verify with the booking titles
    const firstUpcomingBooking = bookingListItems.nth(0);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      firstUpcomingBooking.locator(`text=${thirdUserOrganizerBooking!.title}`)
    ).toBeVisible();

    const secondUpcomingBooking = bookingListItems.nth(1);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      secondUpcomingBooking.locator(`text=${thirdUserAttendeeIndividualBooking!.title}`)
    ).toBeVisible();

    const thirdUpcomingBooking = bookingListItems.nth(2);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      thirdUpcomingBooking.locator(`text=${thirdUserAttendeeTeamEvent!.title}`)
    ).toBeVisible();
  });
});

async function createBooking({
  bookingsFixture,
  organizer,
  organizerEventType,
  attendees,
  /**
   * Relative date from today
   * -1 means yesterday
   * 0 means today
   * 1 means tomorrow
   */
  relativeDate = 0,
  durationMins = 30,
  title,
}: {
  bookingsFixture: Fixtures["bookings"];
  organizer: {
    id: number;
    username: string | null;
  };
  organizerEventType: {
    id: number;
  };
  attendees: {
    name: string;
    email: string;
    timeZone: string;
  }[];
  relativeDate?: number;
  durationMins?: number;
  title: string;
}) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const bookingDurationMs = durationMins * 60 * 1000;
  const startTime = new Date(Date.now() + relativeDate * DAY_MS);
  const endTime = new Date(Date.now() + relativeDate * DAY_MS + bookingDurationMs);
  return await bookingsFixture.create(organizer.id, organizer.username, organizerEventType.id, {
    title,
    status: BookingStatus.ACCEPTED,
    startTime,
    endTime,
    attendees: {
      createMany: {
        data: [...attendees],
      },
    },
  });
}
