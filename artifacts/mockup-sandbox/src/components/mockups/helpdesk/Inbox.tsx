import React, { useState } from 'react';
import {
  MessageSquare,
  Users2,
  Bot,
  Globe2,
  CreditCard,
  Phone,
  Settings,
  Search,
  ChevronDown,
  LayoutGrid,
  List,
  Mail,
  Clock,
  AlertCircle,
  Paperclip,
  Lock,
  Bold,
  Italic,
  Link as LinkIcon,
  Smile,
  CheckCircle2,
  Plus
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import './_group.css';

export function Inbox() {
  const [activeNav, setActiveNav] = useState('inbox');
  const [activeCategory, setActiveCategory] = useState('all-open');
  const [activeTab, setActiveTab] = useState('reply');

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-slate-50 font-sans text-slate-900">
      {/* Pane 1: Nav Rail */}
      <div className="w-[56px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col items-center py-4 justify-between z-10 relative">
        <div className="flex flex-col gap-4 w-full px-2">
          <NavIcon icon={MessageSquare} id="inbox" active={activeNav === 'inbox'} onClick={() => setActiveNav('inbox')} />
          <NavIcon icon={Users2} id="users" active={activeNav === 'users'} onClick={() => setActiveNav('users')} />
          <NavIcon icon={Bot} id="bot" active={activeNav === 'bot'} onClick={() => setActiveNav('bot')} />
          <NavIcon icon={Globe2} id="globe" active={activeNav === 'globe'} onClick={() => setActiveNav('globe')} />
          <NavIcon icon={CreditCard} id="billing" active={activeNav === 'billing'} onClick={() => setActiveNav('billing')} />
        </div>
        <div className="flex flex-col gap-4 w-full px-2 items-center">
          <NavIcon icon={Phone} id="phone" active={false} />
          <NavIcon icon={Settings} id="settings" active={false} />
          <Avatar className="h-8 w-8 cursor-pointer mt-2">
            <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-semibold">SA</AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* Pane 2: Category Rail */}
      <div className="w-[200px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-3 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search tickets…" 
              className="h-8 pl-8 bg-slate-50 border-slate-200 text-xs focus-visible:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto helpdesk-scrollbar p-3 space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">Inbox</h3>
            <div className="space-y-0.5">
              <CategoryItem label="All Open" count={24} active={activeCategory === 'all-open'} onClick={() => setActiveCategory('all-open')} />
              <CategoryItem label="Assigned to Me" count={8} />
              <CategoryItem label="Unassigned" count={16} countColor="bg-rose-500 text-white" />
              <CategoryItem label="Snoozed" count={3} />
              <CategoryItem label="Closed" count={142} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">Views</h3>
            <div className="space-y-0.5">
              <CategoryItem label="VIP Customers" />
              <CategoryItem label="Billing Issues" />
              <CategoryItem label="Technical Support" />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-2">Teams</h3>
            <div className="space-y-0.5">
              <CategoryItem label="Support" count={5} countIsMembers />
              <CategoryItem label="Engineering" count={3} countIsMembers />
            </div>
          </div>
        </div>
      </div>

      {/* Pane 3: Ticket List */}
      <div className="w-[320px] flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900 text-sm">All Open</h2>
            <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-transparent rounded-full px-2 py-0 text-xs h-5">24</Badge>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <button className="flex items-center gap-1 text-xs font-medium hover:text-slate-900">
              Newest <ChevronDown className="h-3 w-3" />
            </button>
            <div className="flex items-center gap-1 border-l border-slate-200 pl-2 ml-1">
              <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900"><List className="h-4 w-4" /></button>
              <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900"><LayoutGrid className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto helpdesk-scrollbar p-3 space-y-2">
          {/* Selected Ticket */}
          <TicketCard 
            selected
            avatarInitials="SM"
            avatarColor="bg-purple-100 text-purple-700"
            name="Sarah Mitchell"
            time="2m"
            subject="Billing issue — double charged for subscription"
            preview="Hi, I noticed I was charged twice this month for my Pro plan subscrip..."
            channel="email"
            priority="urgent"
            assignee="SA"
          />
          {/* Other Tickets */}
          <TicketCard 
            avatarInitials="JD"
            avatarColor="bg-blue-100 text-blue-700"
            name="John Doe"
            time="14m"
            subject="Can't log into my account after password reset"
            preview="I tried resetting my password but the link in the email says it's expired..."
            channel="chat"
            priority="high"
            assignee="SA"
          />
          <TicketCard 
            avatarInitials="EL"
            avatarColor="bg-emerald-100 text-emerald-700"
            name="Emma Lewis"
            time="1h"
            subject="Feature request: export to CSV"
            preview="Is there any timeline on when we might be able to export reports to C..."
            channel="email"
            priority="normal"
            assignee="UN"
          />
          <TicketCard 
            avatarInitials="MT"
            avatarColor="bg-amber-100 text-amber-700"
            name="Mike Taylor"
            time="3h"
            subject="Integration with Zapier not working"
            preview="Our Zaps have been failing since yesterday morning with an API error..."
            channel="chat"
            priority="high"
            assignee="SA"
          />
          <TicketCard 
            avatarInitials="AK"
            avatarColor="bg-pink-100 text-pink-700"
            name="Alex Kim"
            time="5h"
            subject="How do I add team members?"
            preview="I can't find the setting to invite my colleagues to the workspace. Can yo..."
            channel="email"
            priority="normal"
            assignee="UN"
          />
          <TicketCard 
            avatarInitials="RS"
            avatarColor="bg-cyan-100 text-cyan-700"
            name="Rachel Smith"
            time="1d"
            subject="Slow page loads on dashboard"
            preview="The main dashboard is taking over 10 seconds to load for all our users..."
            channel="voice"
            priority="urgent"
            assignee="EN"
          />
        </div>
      </div>

      {/* Pane 4: Thread */}
      <div className="flex-1 min-w-0 flex flex-col bg-white">
        <div className="border-b border-slate-200 p-4 flex-shrink-0 flex items-start justify-between">
          <div className="min-w-0 pr-4">
            <h1 className="text-lg font-semibold text-slate-900 truncate mb-2">Billing issue — double charged for subscription</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-transparent rounded-full px-2 py-0 text-xs">Open</Badge>
              <Badge variant="outline" className="text-xs border-slate-200 font-medium text-rose-600 px-2 py-0"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5"></span>Urgent</Badge>
              <Badge variant="outline" className="text-xs border-slate-200 font-medium text-slate-600 px-2 py-0"><Mail className="h-3 w-3 mr-1" />Email</Badge>
              <span className="text-xs text-slate-400 font-medium ml-1">Req #4821</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" className="h-8 text-xs font-medium border-slate-200 text-slate-700">Snooze</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs font-medium border-slate-200 text-slate-700">Assign <ChevronDown className="h-3 w-3 ml-1" /></Button>
            <Button size="sm" className="h-8 text-xs font-medium bg-slate-900 text-white hover:bg-slate-800">Resolve</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto helpdesk-scrollbar p-4 space-y-4 bg-white">
          {/* Customer Msg 1 */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-purple-100 text-purple-700 text-xs font-semibold">SM</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium text-sm text-slate-900">Sarah Mitchell</div>
                <div className="text-xs text-slate-400">2 days ago</div>
              </div>
            </div>
            <div className="text-sm text-slate-700 mb-3 leading-relaxed">
              Hi, I noticed I was charged twice this month for my Pro plan subscription. The charges appeared on Jan 12th and Jan 13th. Can you please look into this and issue a refund? My account email is sarah@example.com.
            </div>
            <div className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 cursor-pointer transition-colors">
              <Paperclip className="h-3.5 w-3.5" />
              billing_screenshot.png
            </div>
          </div>

          {/* Agent Reply */}
          <div className="bg-indigo-50/20 border-l-4 border-indigo-400 rounded-r-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-semibold">SA</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium text-sm text-slate-900">Sam Avery (You)</div>
                <div className="text-xs text-slate-400">1 day ago</div>
              </div>
            </div>
            <div className="text-sm text-slate-700 leading-relaxed">
              Hi Sarah, Thank you for reaching out. I can confirm we see the duplicate charge on our end. I've initiated a refund for the second charge of $49.00. It should appear within 3-5 business days. I'll also add a courtesy credit to your account.
            </div>
          </div>

          {/* Internal Note */}
          <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg p-4">
            <div className="flex items-center gap-1.5 mb-3 text-amber-700">
              <Lock className="h-3.5 w-3.5" />
              <span className="text-xs font-bold uppercase tracking-wider">Internal Note</span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-semibold">SA</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium text-sm text-slate-900">Sam Avery</div>
                <div className="text-xs text-slate-400">23 hours ago</div>
              </div>
            </div>
            <div className="text-sm text-amber-900/80 leading-relaxed font-medium">
              Checked with billing — this was a system error during the migration. Escalating to engineering to fix the root cause.
            </div>
          </div>

          {/* Customer Reply 2 */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-purple-100 text-purple-700 text-xs font-semibold">SM</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium text-sm text-slate-900">Sarah Mitchell</div>
                <div className="text-xs text-slate-400">20 hours ago</div>
              </div>
            </div>
            <div className="text-sm text-slate-700 leading-relaxed">
              Thank you so much for the quick response! I can see the refund is pending. Really appreciate the help.
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-slate-200 bg-white flex-shrink-0">
          <div className="flex border-b border-slate-200 px-4">
            <button 
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'reply' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              onClick={() => setActiveTab('reply')}
            >
              Reply
            </button>
            <button 
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'note' ? 'border-amber-400 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              onClick={() => setActiveTab('note')}
            >
              Note
            </button>
            <button 
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'forward' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              onClick={() => setActiveTab('forward')}
            >
              Forward
            </button>
          </div>
          <div className={`p-4 ${activeTab === 'note' ? 'bg-amber-50/30' : ''}`}>
            <Textarea 
              placeholder={activeTab === 'note' ? 'Type an internal note...' : 'Type your reply…'} 
              className={`h-24 resize-none mb-3 text-sm focus-visible:ring-1 ${activeTab === 'note' ? 'bg-amber-50/50 border-amber-200 focus-visible:ring-amber-400' : 'bg-slate-50 border-slate-200 focus-visible:ring-indigo-500'}`}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-slate-400">
                <button className="p-1.5 hover:bg-slate-100 rounded hover:text-slate-700 transition-colors"><Bold className="h-4 w-4" /></button>
                <button className="p-1.5 hover:bg-slate-100 rounded hover:text-slate-700 transition-colors"><Italic className="h-4 w-4" /></button>
                <button className="p-1.5 hover:bg-slate-100 rounded hover:text-slate-700 transition-colors"><LinkIcon className="h-4 w-4" /></button>
                <div className="w-px h-4 bg-slate-200 mx-1"></div>
                <button className="p-1.5 hover:bg-slate-100 rounded hover:text-slate-700 transition-colors"><Paperclip className="h-4 w-4" /></button>
                <button className="p-1.5 hover:bg-slate-100 rounded hover:text-slate-700 transition-colors"><Smile className="h-4 w-4" /></button>
              </div>
              <Button 
                className={activeTab === 'note' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'}
              >
                {activeTab === 'note' ? 'Add Note' : 'Send Reply'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Pane 5: Details */}
      <div className="w-[300px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
        <div className="flex-1 overflow-y-auto helpdesk-scrollbar">
          {/* Contact */}
          <div className="p-5 border-b border-slate-100">
            <div className="flex flex-col items-center text-center">
              <Avatar className="h-12 w-12 mb-3">
                <AvatarFallback className="bg-purple-100 text-purple-700 text-lg font-semibold">SM</AvatarFallback>
              </Avatar>
              <h2 className="text-base font-semibold text-slate-900">Sarah Mitchell</h2>
              <p className="text-sm text-slate-500 mb-3">sarah@example.com</p>
              <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-transparent rounded-full px-2.5 mb-4 text-xs font-medium">Customer</Badge>
              
              <div className="w-full space-y-2 mt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Phone</span>
                  <span className="text-slate-900 font-medium">+1 (555) 234-5678</span>
                </div>
                <div className="flex justify-center pt-2">
                  <a href="#" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">View Contact</a>
                </div>
              </div>
            </div>
          </div>

          {/* Ticket Details */}
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 text-sm">Ticket Details</h3>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </div>
            <div className="space-y-3">
              <DetailRow label="Assignee">
                <div className="flex items-center gap-1.5">
                  <Avatar className="h-5 w-5"><AvatarFallback className="bg-indigo-100 text-indigo-700 text-[10px] font-bold">SA</AvatarFallback></Avatar>
                  <span className="text-sm font-medium text-slate-900">Sam Avery</span>
                </div>
              </DetailRow>
              <DetailRow label="Team" value="Support" />
              <DetailRow label="Priority">
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Urgent
                </div>
              </DetailRow>
              <DetailRow label="Status" value="Open" />
              <DetailRow label="Channel">
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  Email
                </div>
              </DetailRow>
              <DetailRow label="Created" value="Jan 12, 2026 · 9:14 AM" />
              <DetailRow label="First Reply SLA">
                <div className="flex items-center gap-1.5 text-sm font-medium text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Breached
                </div>
              </DetailRow>
              <DetailRow label="Resolution SLA">
                <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600">
                  <Clock className="h-3.5 w-3.5" />
                  4h 23m remaining
                </div>
              </DetailRow>
            </div>
          </div>

          {/* Tags */}
          <div className="p-5 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm mb-3">Tags</h3>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-transparent rounded px-2 py-0.5 text-xs font-medium">billing</Badge>
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-transparent rounded px-2 py-0.5 text-xs font-medium">refund</Badge>
              <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-transparent rounded px-2 py-0.5 text-xs font-medium">urgent</Badge>
              <button className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 border border-dashed border-slate-300 rounded px-2 py-0.5 transition-colors">
                <Plus className="h-3 w-3" /> Add tag
              </button>
            </div>
          </div>

          {/* History */}
          <div className="p-5">
            <h3 className="font-semibold text-slate-900 text-sm mb-1">Conversation History</h3>
            <p className="text-xs text-slate-500 mb-3">3 previous tickets</p>
            <div className="space-y-2">
              <HistoryCard status="resolved" title="Login issue on mobile app" date="Dec 15, 2025" id="#4102" />
              <HistoryCard status="resolved" title="Question about Pro features" date="Nov 2, 2025" id="#3894" />
              <HistoryCard status="open" title="How to update billing email" date="Jan 10, 2026" id="#4780" />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function NavIcon({ icon: Icon, id, active, onClick }: { icon: any, id: string, active: boolean, onClick?: () => void }) {
  if (active) {
    return (
      <div 
        className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center cursor-pointer relative"
        onClick={onClick}
      >
        <div className="absolute left-[-8px] top-1 bottom-1 w-1 bg-indigo-600 rounded-r-md"></div>
        <Icon className="h-5 w-5" />
      </div>
    );
  }
  
  return (
    <div 
      className="w-10 h-10 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
      onClick={onClick}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}

function CategoryItem({ label, count, active, onClick, countColor, countIsMembers }: { label: string, count?: number, active?: boolean, onClick?: () => void, countColor?: string, countIsMembers?: boolean }) {
  return (
    <div 
      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${active ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
      onClick={onClick}
    >
      <span className={active ? 'font-semibold' : 'font-medium'}>{label}</span>
      {count !== undefined && (
        <span className={`text-xs px-1.5 rounded-full ${countColor || (active ? '' : 'text-slate-400')}`}>
          {count} {countIsMembers && 'members'}
        </span>
      )}
    </div>
  );
}

function TicketCard({ 
  selected, avatarInitials, avatarColor, name, time, subject, preview, channel, priority, assignee 
}: { 
  selected?: boolean, avatarInitials: string, avatarColor: string, name: string, time: string, subject: string, preview: string, channel: 'email' | 'chat' | 'voice', priority: 'urgent' | 'high' | 'normal', assignee: string 
}) {
  const ChannelIcon = channel === 'email' ? Mail : channel === 'chat' ? MessageSquare : Phone;
  
  return (
    <div className={`p-3 rounded-lg border cursor-pointer transition-all ${
      selected 
        ? 'border-indigo-400 bg-indigo-50/30 shadow-sm relative' 
        : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm'
    }`}>
      {selected && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r-md"></div>}
      
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className={`${avatarColor} text-[10px] font-bold`}>{avatarInitials}</AvatarFallback>
          </Avatar>
          <span className={`text-sm ${selected ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{name}</span>
        </div>
        <span className={`text-xs ${selected ? 'text-indigo-600 font-medium' : 'text-slate-400'}`}>{time}</span>
      </div>
      
      <div className={`text-sm font-medium truncate mb-1 pr-2 ${selected ? 'text-slate-900' : 'text-slate-800'}`}>
        {subject}
      </div>
      <div className="text-xs text-slate-500 truncate mb-3 pr-2">
        {preview}
      </div>
      
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-slate-100 text-slate-500">
            <ChannelIcon className="h-3 w-3" />
          </div>
          {priority === 'urgent' && <Badge variant="outline" className="text-[10px] uppercase font-bold border-rose-200 text-rose-600 px-1 py-0 h-5 bg-rose-50">Urgent</Badge>}
          {priority === 'high' && <Badge variant="outline" className="text-[10px] uppercase font-bold border-amber-200 text-amber-600 px-1 py-0 h-5 bg-amber-50">High</Badge>}
        </div>
        <Avatar className="h-5 w-5">
          <AvatarFallback className="bg-slate-100 text-slate-600 text-[9px] font-bold border border-slate-200">{assignee}</AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}

function DetailRow({ label, value, children }: { label: string, value?: string, children?: React.ReactNode }) {
  return (
    <div className="flex items-start">
      <div className="w-[100px] text-sm text-slate-500 flex-shrink-0 pt-0.5">{label}</div>
      <div className="flex-1 min-w-0">
        {value ? <span className="text-sm font-medium text-slate-900">{value}</span> : children}
      </div>
    </div>
  );
}

function HistoryCard({ status, title, date, id }: { status: 'resolved' | 'open', title: string, date: string, id: string }) {
  return (
    <div className="p-2.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="font-medium text-xs text-slate-900 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
          {title}
        </div>
        <Badge variant="outline" className={`text-[9px] uppercase px-1 py-0 h-4 border-transparent flex-shrink-0 ${status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {status}
        </Badge>
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
        <span>{date}</span>
        <span>{id}</span>
      </div>
    </div>
  );
}
