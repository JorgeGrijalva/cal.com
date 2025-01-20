import { getCalendar } from "@calcom/app-store/_utils/getCalendar";
import { isDwdCredential } from "@calcom/lib/domainWideDelegation/clientAndServer";
import logger from "@calcom/lib/logger";
import { getPiiFreeCredential, getPiiFreeSelectedCalendar } from "@calcom/lib/piiFreeData";
import { safeStringify } from "@calcom/lib/safeStringify";
import { performance } from "@calcom/lib/server/perfObserver";
import type { EventBusyDate, SelectedCalendar } from "@calcom/types/Calendar";
import type { CredentialForCalendarService } from "@calcom/types/Credential";

const log = logger.getSubLogger({ prefix: ["getCalendarsEvents"] });
// only for Google Calendar for now
export const getCalendarsEventsWithTimezones = async (
  withCredentials: CredentialForCalendarService[],
  dateFrom: string,
  dateTo: string,
  selectedCalendars: SelectedCalendar[]
): Promise<(EventBusyDate & { timeZone: string })[][]> => {
  const calendarCredentials = withCredentials
    .filter((credential) => credential.type === "google_calendar")
    // filter out invalid credentials - these won't work.
    .filter((credential) => !credential.invalid);

  const calendars = await Promise.all(calendarCredentials.map((credential) => getCalendar(credential)));

  const results = calendars.map(async (c, i) => {
    /** Filter out nulls */
    if (!c) return [];
    /** We rely on the index so we can match credentials with calendars */
    const { type } = calendarCredentials[i];
    /** We just pass the calendars that matched the credential type,
     * TODO: Migrate credential type or appId
     */
    const passedSelectedCalendars = selectedCalendars
      .filter((sc) => sc.integration === type)
      // Needed to ensure cache keys are consistent
      .sort((a, b) => (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0));
    if (!passedSelectedCalendars.length) return [];
    /** We extract external Ids so we don't cache too much */
    const eventBusyDates =
      (await c.getAvailabilityWithTimeZones?.(dateFrom, dateTo, passedSelectedCalendars)) || [];

    return eventBusyDates;
  });
  const awaitedResults = await Promise.all(results);
  return awaitedResults;
};

const getCalendarsEvents = async (
  withCredentials: CredentialForCalendarService[],
  dateFrom: string,
  dateTo: string,
  selectedCalendars: SelectedCalendar[],
  shouldServeCache?: boolean
): Promise<EventBusyDate[][]> => {
  const calendarCredentials = withCredentials
    .filter((credential) => credential.type.endsWith("_calendar"))
    // filter out invalid credentials - these won't work.
    .filter((credential) => !credential.invalid);

  const calendars = await Promise.all(calendarCredentials.map((credential) => getCalendar(credential)));
  const calendarToCredentialMap = new Map(
    calendarCredentials.map((credential, index) => [calendars[index], credential])
  );
  performance.mark("getBusyCalendarTimesStart");
  const results = calendars.map(async (calendarService, i) => {
    /** Filter out nulls */
    if (!calendarService) return [];
    /** We rely on the index so we can match credentials with calendars */
    const { type, appId } = calendarCredentials[i];
    /** We just pass the calendars that matched the credential type,
     * TODO: Migrate credential type or appId
     */
    // Important to have them unique so that
    const passedSelectedCalendars = selectedCalendars
      .filter((sc) => sc.integration === type)
      // Needed to ensure cache keys are consistent
      .sort((a, b) => (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0));
    const credential = calendarToCredentialMap.get(calendarService);
    const isADwdCredential = credential && isDwdCredential({ credentialId: credential.id });

    if (!passedSelectedCalendars.length) {
      if (!isADwdCredential) {
        // It was done to fix the secondary calendar connections from always checking the conflicts even if intentional no calendars are selected.
        // https://github.com/calcom/cal.com/issues/8929
        log.debug("No selected calendars for non DWD credential: Skipping getAvailability call");
        return [];
      }
      // For DWD credential, we should allow getAvailability even without any selected calendars, because DWD credential is enforced at organization level where it would be expected.
      // If it ever comes up us a requirement to not do this always, we would have to ensure to add SelectedCalendar entry for all existing members and any new members being added.
      // CalendarService can then choose the primary calendar for conflicts checking.
      // This is also, similar to how Google Calendar connect flow(through /googlecalendar/api/callback) sets the primary calendar as the selected calendar automatically.
      log.debug("Allowing getAvailability even without any selected calendars for DWD credential");
    }
    /** We extract external Ids so we don't cache too much */

    const selectedCalendarIds = passedSelectedCalendars.map((sc) => sc.externalId);
    /** If we don't then we actually fetch external calendars (which can be very slow) */
    performance.mark("eventBusyDatesStart");
    log.debug(
      `Getting availability for`,
      safeStringify({
        calendarService: calendarService.constructor.name,
        selectedCalendars: passedSelectedCalendars.map(getPiiFreeSelectedCalendar),
      })
    );
    const eventBusyDates = await calendarService.getAvailability(
      dateFrom,
      dateTo,
      passedSelectedCalendars,
      shouldServeCache
    );
    performance.mark("eventBusyDatesEnd");
    performance.measure(
      `[getAvailability for ${selectedCalendarIds.join(", ")}][$1]'`,
      "eventBusyDatesStart",
      "eventBusyDatesEnd"
    );

    return eventBusyDates.map((a) => ({
      ...a,
      source: `${appId}`,
    }));
  });
  const awaitedResults = await Promise.all(results);
  performance.mark("getBusyCalendarTimesEnd");
  performance.measure(
    `getBusyCalendarTimes took $1 for creds ${calendarCredentials.map((cred) => cred.id)}`,
    "getBusyCalendarTimesStart",
    "getBusyCalendarTimesEnd"
  );
  log.debug(
    "Result",
    safeStringify({
      calendarCredentials: calendarCredentials.map(getPiiFreeCredential),
      selectedCalendars: selectedCalendars.map(getPiiFreeSelectedCalendar),
      calendarEvents: awaitedResults,
    })
  );
  return awaitedResults;
};

export default getCalendarsEvents;
