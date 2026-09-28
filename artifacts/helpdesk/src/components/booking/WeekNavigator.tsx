import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
export function calendarDay(iso:string,timezone:string){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}
export function WeekNavigator({timezone,value,onChange,dates}:{timezone:string;value:string|null;onChange:(day:string|null)=>void;dates:string[]}) {
 const [offset,setOffset]=useState(0);
 const today=calendarDay(new Date().toISOString(),timezone);
 const days=Array.from({length:7},(_,i)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset+i);return d;});
 return <div className="cl-week"><div className="cl-week-heading"><strong>{days[0].toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'})}</strong><div><button onClick={()=>setOffset(n=>n-7)} aria-label="Previous week"><ChevronLeft size={18}/></button><button onClick={()=>{setOffset(0);onChange(null);}}>All dates</button><button onClick={()=>setOffset(n=>n+7)} aria-label="Next week"><ChevronRight size={18}/></button></div></div><div className="cl-week-days">{days.map(d=>{const key=d.toISOString().slice(0,10),count=dates.filter(iso=>calendarDay(iso,timezone)===key).length;return <button key={key} aria-pressed={value===key} onClick={()=>onChange(value===key?null:key)}><small>{d.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</small><strong>{d.getUTCDate()}</strong><span>{count?`${count} scheduled`:'—'}</span></button>;})}</div></div>;
}
