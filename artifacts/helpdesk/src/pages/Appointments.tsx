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
          <TabsList className="h-10 w-full justify-start gap-6 overflow-x-auto border-0 bg-transparent p-0">
            <TabsTrigger value="preview" className="data-[state=active]:bg-surface-muted">Booking preview</TabsTrigger>
            <TabsTrigger value="requests" className="data-[state=active]:bg-surface-muted">Requests</TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-surface-muted">Availability settings</TabsTrigger>
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
