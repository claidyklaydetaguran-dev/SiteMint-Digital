import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import { AppointmentRequestsList } from "@/components/booking/AppointmentRequestsList";
import { AvailabilitySettingsForm } from "@/components/booking/AvailabilitySettingsForm";

export default function Appointments() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Appointments</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The visual booking calendar, requests, and availability rules — all backed by the same
          server-side availability engine the voice assistant will use.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <Tabs defaultValue="preview" className="flex h-full flex-col">
          {/*
            Fixed-width, non-scrolling tab bar: each label swaps to a short
            mobile form via CSS (not overflow-x-auto) so every tab is always
            fully visible with no horizontal scroll and no discoverability
            problem to signal in the first place.
          */}
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 border-0 bg-transparent p-0 sm:flex sm:h-10 sm:w-auto sm:gap-6">
            <TabsTrigger value="preview" className="min-h-11 text-xs data-[state=active]:bg-surface-muted sm:text-sm">
              <span className="sm:hidden">Preview</span>
              <span className="hidden sm:inline">Booking preview</span>
            </TabsTrigger>
            <TabsTrigger value="requests" className="min-h-11 text-xs data-[state=active]:bg-surface-muted sm:text-sm">
              Requests
            </TabsTrigger>
            <TabsTrigger value="settings" className="min-h-11 text-xs data-[state=active]:bg-surface-muted sm:text-sm">
              <span className="sm:hidden">Settings</span>
              <span className="hidden sm:inline">Availability settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-4">
            <p className="mb-3 text-xs text-muted-foreground">
              This is what a customer sees. Nothing submitted here is a real appointment — every
              request lands as "Pending review."
            </p>
            <BookingCalendar />
          </TabsContent>

          <TabsContent value="requests" className="mt-4">
            <AppointmentRequestsList />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <AvailabilitySettingsForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
