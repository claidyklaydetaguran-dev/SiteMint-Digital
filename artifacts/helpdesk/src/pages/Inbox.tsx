import { useState } from "react";
import { useListHelpdeskTickets, useGetHelpdeskTicket, getGetHelpdeskTicketQueryKey } from "@workspace/api-client-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Filter, Mail, MessageSquare, Phone, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

function getChannelIcon(channel: string) {
  switch (channel) {
    case "email": return <Mail className="h-3 w-3" />;
    case "chat": return <MessageSquare className="h-3 w-3" />;
    case "sms": return <MessageCircle className="h-3 w-3" />;
    case "voice": return <Phone className="h-3 w-3" />;
    default: return <Mail className="h-3 w-3" />;
  }
}

export default function Inbox() {
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  
  const { data: tickets, isLoading: isLoadingTickets } = useListHelpdeskTickets();
  const { data: ticketDetail, isLoading: isLoadingDetail } = useGetHelpdeskTicket(
    selectedTicketId as number,
    { query: { enabled: !!selectedTicketId, queryKey: getGetHelpdeskTicketQueryKey(selectedTicketId as number) } }
  );

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full w-full rounded-none">
      {/* Views Panel (Optional 4th pane, acting as the secondary nav) */}
      <ResizablePanel defaultSize={15} minSize={10} maxSize={20} className="bg-muted/30 border-r">
        <div className="p-4 border-b h-14 flex items-center">
          <h2 className="font-semibold text-sm">Views</h2>
        </div>
        <ScrollArea className="h-[calc(100vh-3.5rem)]">
          <div className="p-2 space-y-1">
            <Button variant="ghost" className="w-full justify-start text-sm h-8 font-medium bg-accent">
              Unassigned
            </Button>
            <Button variant="ghost" className="w-full justify-start text-sm h-8 text-muted-foreground">
              Assigned to me
            </Button>
            <Button variant="ghost" className="w-full justify-start text-sm h-8 text-muted-foreground">
              All open
            </Button>
          </div>
        </ScrollArea>
      </ResizablePanel>
      
      <ResizableHandle withHandle />

      {/* Ticket List Panel */}
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="bg-background">
        <div className="p-3 border-b h-14 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="h-8 pl-8 text-sm" />
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-3.5rem)]">
          {isLoadingTickets ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading tickets...</div>
          ) : tickets?.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No tickets found</div>
          ) : (
            <div className="flex flex-col">
              {tickets?.map((ticket) => (
                <button
                  key={ticket.id}
                  data-testid={`card-ticket-${ticket.id}`}
                  className={`text-left p-3 border-b hover:bg-accent/50 transition-colors ${selectedTicketId === ticket.id ? 'bg-accent' : ''}`}
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {getChannelIcon(ticket.channel)}
                      <span className="font-medium text-foreground">{ticket.contactName}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(ticket.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="font-medium text-sm leading-tight mb-1 truncate">
                    {ticket.subject}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {ticket.snippetText}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px] px-1 h-4 bg-background">
                      {ticket.ticketNumber}
                    </Badge>
                    {ticket.priority === 'urgent' && <div className="w-2 h-2 rounded-full bg-destructive" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Message Thread Panel */}
      <ResizablePanel defaultSize={40} minSize={30}>
        {selectedTicketId && ticketDetail ? (
          <div className="h-full flex flex-col bg-background">
            <div className="p-4 border-b flex-none">
              <h2 className="font-semibold text-lg">{ticketDetail.ticket.subject}</h2>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">{ticketDetail.ticket.status}</Badge>
                <span>{ticketDetail.ticket.ticketNumber}</span>
              </div>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-6">
                {ticketDetail.messages.map((msg) => (
                  <div key={msg.id} className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback style={{ backgroundColor: msg.authorAvatarColor }} className="text-white text-xs">
                        {msg.authorInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`flex-1 rounded-md p-3 text-sm ${msg.isInternalNote ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50' : 'bg-muted/50'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold">{msg.authorName}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap">{msg.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-4 border-t flex-none bg-background">
              <div className="border rounded-md focus-within:ring-1 focus-within:ring-ring bg-card">
                <textarea 
                  className="w-full min-h-[100px] p-3 text-sm bg-transparent border-none focus:outline-none resize-none"
                  placeholder="Type a reply or an internal note..."
                />
                <div className="p-2 bg-muted/50 border-t flex justify-between items-center">
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="h-8 text-xs">Internal Note</Button>
                  </div>
                  <Button size="sm">Send Reply</Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Select a ticket to view conversation
          </div>
        )}
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right Detail Panel */}
      <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-muted/10 border-l">
        {selectedTicketId && ticketDetail ? (
          <ScrollArea className="h-screen">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-sm mb-4">Contact Details</h3>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback style={{ backgroundColor: ticketDetail.contact.avatarColor }} className="text-white">
                    {ticketDetail.contact.initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium text-sm">{ticketDetail.contact.name}</div>
                  <div className="text-xs text-muted-foreground">{ticketDetail.contact.email}</div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-b">
              <h3 className="font-semibold text-sm mb-4">Ticket Info</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Assignee</div>
                  <div>{ticketDetail.ticket.assigneeName || 'Unassigned'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Priority</div>
                  <Badge variant="outline" className="capitalize">{ticketDetail.ticket.priority}</Badge>
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            No ticket selected
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}