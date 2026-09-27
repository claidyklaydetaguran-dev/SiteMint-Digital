import { Link } from 'wouter';
import { Clock, List, Pencil } from 'lucide-react';
import { CharCountField } from '@/components/common/CharCountField';
import { useAvailabilityConfig } from '@/hooks/useAvailability';
import { ROUTES } from '@/lib/routes';
import type { BuilderTabProps } from './BuilderShell';
export default function ConfigurationTab({draft,update,businessInfo}:BuilderTabProps){
 const availability=useAvailabilityConfig();
 const {setup,prompt}=draft;
 return <div className="cf-business-form">
 <h2 className="sd-h2">Business information</h2><p className="si-hint">Help your assistant introduce your business and answer questions.</p>
 <div className="si-field"><label className="si-label">Business name</label><div className="cf-readonly">{businessInfo?.name||setup.businessName||'Not configured'}<Link href={ROUTES.settings} aria-label="Edit business name"><Pencil size={15}/></Link></div></div>
 <CharCountField id="business-greeting" label="Greeting" value={prompt.firstMessage} onChange={v=>update(d=>({...d,prompt:{...d.prompt,firstMessage:v}}))} maxLength={1000} rows={3} helpText="What your assistant says when a call is answered."/>
 <div className="cf-business-row"><span className="cl-round"><Clock size={22}/></span><div><h3>Business hours</h3><p>{availability.isError?'Hours could not be loaded':'Weekly availability and exceptions'}</p><small>{availability.data?.config.timezone}</small></div><Link href={ROUTES.availability}><Pencil size={14}/>Edit</Link></div>
 <div className="cf-business-row"><span className="cl-round"><List size={22}/></span><div><h3>Services</h3><p>{availability.data?.config.appointmentTypes.map(t=>t.name).join(' · ')||'Add the services customers can book'}</p></div><Link href={ROUTES.appointmentTypes}><Pencil size={14}/>Edit</Link></div>
 <details className="cf-advanced"><summary>Additional business details</summary>{([{key:'role',label:'Role'},{key:'primaryGoal',label:'Primary goal'},{key:'timezone',label:'Business timezone'},{key:'language',label:'Supported language'}] as const).map(({key,label})=><div className="si-field" key={key}><label className="si-label" htmlFor={'business-'+key}>{label}</label><input className="si-input" id={'business-'+key} value={setup[key]} onChange={e=>update(d=>({...d,setup:{...d.setup,[key]:e.target.value}}))}/></div>)}
 <CharCountField id="business-context" label="Business context" value={prompt.businessInformation} onChange={v=>update(d=>({...d,prompt:{...d.prompt,businessInformation:v}}))} maxLength={2000} rows={4}/></details></div>;
}
