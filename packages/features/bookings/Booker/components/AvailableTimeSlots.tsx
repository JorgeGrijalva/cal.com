import { useRef } from "react";

import dayjs from "@calcom/dayjs";
import { AvailableTimes, AvailableTimesSkeleton } from "@calcom/features/bookings";
import type { IUseBookingLoadingStates } from "@calcom/features/bookings/Booker/components/hooks/useBookings";
import type { BookerEvent } from "@calcom/features/bookings/types";
import { useNonEmptyScheduleDays } from "@calcom/features/schedules";
import { useSlotsForAvailableDates } from "@calcom/features/schedules/lib/use-schedule/useSlotsForDate";
import { classNames } from "@calcom/lib";
import { PUBLIC_INVALIDATE_AVAILABLE_SLOTS_ON_BOOKING_FORM } from "@calcom/lib/constants";
import { BookerLayouts } from "@calcom/prisma/zod-utils";

import { AvailableTimesHeader } from "../../components/AvailableTimesHeader";
import { useBookerStore } from "../store";
import type { useScheduleForEventReturnType } from "../utils/event";

type AvailableTimeSlotsProps = {
  extraDays?: number;
  limitHeight?: boolean;
  schedule?: useScheduleForEventReturnType;
  isLoading: boolean;
  seatsPerTimeSlot?: number | null;
  showAvailableSeatsCount?: boolean | null;
  event: {
    data?: Pick<BookerEvent, "length" | "bookingFields" | "price" | "currency" | "metadata"> | null;
  };
  customClassNames?: {
    availableTimeSlotsContainer?: string;
    availableTimeSlotsTitle?: string;
    availableTimeSlotsHeaderContainer?: string;
    availableTimeSlotsTimeFormatToggle?: string;
    availableTimes?: string;
  };
  loadingStates: IUseBookingLoadingStates;
  isVerificationCodeSending: boolean;
  renderConfirmNotVerifyEmailButtonCond: boolean;
  onSubmit: (timeSlot?: string) => void;
  skipConfirmStep: boolean;
  shouldRenderCaptcha?: boolean;
  watchedCfToken?: string;
  unavailableTimeSlots: string[];
};

/**
 * Renders available time slots for a given date.
 * It will extract the date from the booker store.
 * Next to that you can also pass in the `extraDays` prop, this
 * will also fetch the next `extraDays` days and show multiple days
 * in columns next to each other.
 */

export const AvailableTimeSlots = ({
  extraDays,
  limitHeight,
  showAvailableSeatsCount,
  schedule,
  isLoading,
  customClassNames,
  skipConfirmStep,
  onSubmit,
  unavailableTimeSlots,
  ...props
}: AvailableTimeSlotsProps) => {
  const selectedDate = useBookerStore((state) => state.selectedDate);
  const setSelectedTimeslot = useBookerStore((state) => state.setSelectedTimeslot);
  const setSeatedEventData = useBookerStore((state) => state.setSeatedEventData);
  const date = selectedDate || dayjs().format("YYYY-MM-DD");
  const [layout] = useBookerStore((state) => [state.layout]);
  const isColumnView = layout === BookerLayouts.COLUMN_VIEW;
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onTentativeTimeSelect = ({
    time,
    attendees: _attendees,
    seatsPerTimeSlot: _seatsPerTimeSlot,
    bookingUid: _bookingUid,
  }: {
    time: string;
    attendees: number;
    seatsPerTimeSlot?: number | null;
    bookingUid?: string;
  }) => {
    // We don't intentionally invalidate schedule here because that could remove the slot itself that was clicked, causing a bad UX.
    // We could start doing that after we fix this behaviour.
    setSelectedTimeslot(time);
  };

  const onTimeSelect = (
    time: string,
    attendees: number,
    seatsPerTimeSlot?: number | null,
    bookingUid?: string
  ) => {
    // Temporarily allow disabling it, till we are sure that it doesn't cause any significant load on the system
    if (PUBLIC_INVALIDATE_AVAILABLE_SLOTS_ON_BOOKING_FORM) {
      // Ensures that user has latest available slots when they are about to confirm the booking by filling up the details
      schedule?.invalidate();
    }
    setSelectedTimeslot(time);
    if (seatsPerTimeSlot) {
      setSeatedEventData({
        seatsPerTimeSlot,
        attendees,
        bookingUid,
        showAvailableSeatsCount,
      });
    }

    const isTimeSlotAvailable = !unavailableTimeSlots.includes(time);
    if (skipConfirmStep && isTimeSlotAvailable) {
      onSubmit(time);
    }
    return;
  };

  const scheduleData = schedule?.data;
  const nonEmptyScheduleDays = useNonEmptyScheduleDays(scheduleData?.slots);
  const nonEmptyScheduleDaysFromSelectedDate = nonEmptyScheduleDays.filter(
    (slot) => dayjs(selectedDate).diff(slot, "day") <= 0
  );

  // Creates an array of dates to fetch slots for.
  // If `extraDays` is passed in, we will extend the array with the next `extraDays` days.
  const dates = !extraDays
    ? [date]
    : nonEmptyScheduleDaysFromSelectedDate.length > 0
    ? nonEmptyScheduleDaysFromSelectedDate.slice(0, extraDays)
    : [];

  const slotsPerDay = useSlotsForAvailableDates(dates, scheduleData?.slots);

  return (
    <>
      <div className={classNames(`flex`, `${customClassNames?.availableTimeSlotsContainer}`)}>
        {isLoading ? (
          <div className="mb-3 h-8" />
        ) : (
          slotsPerDay.length > 0 &&
          slotsPerDay.map((slots) => (
            <AvailableTimesHeader
              customClassNames={{
                availableTimeSlotsHeaderContainer: customClassNames?.availableTimeSlotsHeaderContainer,
                availableTimeSlotsTitle: customClassNames?.availableTimeSlotsTitle,
                availableTimeSlotsTimeFormatToggle: customClassNames?.availableTimeSlotsTimeFormatToggle,
              }}
              key={slots.date}
              date={dayjs(slots.date)}
              showTimeFormatToggle={!isColumnView}
              availableMonth={
                dayjs(selectedDate).format("MM") !== dayjs(slots.date).format("MM")
                  ? dayjs(slots.date).format("MMM")
                  : undefined
              }
            />
          ))
        )}
      </div>

      <div
        ref={containerRef}
        className={classNames(
          limitHeight && "scroll-bar flex-grow overflow-auto md:h-[400px]",
          !limitHeight && "flex h-full w-full flex-row gap-4",
          `${customClassNames?.availableTimeSlotsContainer}`
        )}>
        {isLoading && // Shows exact amount of days as skeleton.
          Array.from({ length: 1 + (extraDays ?? 0) }).map((_, i) => <AvailableTimesSkeleton key={i} />)}
        {!isLoading &&
          slotsPerDay.length > 0 &&
          slotsPerDay.map((slots) => (
            <div key={slots.date} className="scroll-bar h-full w-full overflow-y-auto overflow-x-hidden">
              <AvailableTimes
                className={customClassNames?.availableTimeSlotsContainer}
                customClassNames={customClassNames?.availableTimes}
                showTimeFormatToggle={!isColumnView}
                onTimeSelect={onTimeSelect}
                onTentativeTimeSelect={onTentativeTimeSelect}
                unavailableTimeSlots={unavailableTimeSlots}
                slots={slots.slots}
                showAvailableSeatsCount={showAvailableSeatsCount}
                skipConfirmStep={skipConfirmStep}
                {...props}
              />
            </div>
          ))}
      </div>
    </>
  );
};
