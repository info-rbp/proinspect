import {Link} from 'react-router';
import {useWorkspace} from '../lib/workspace';
import {PageHeading,EmptyState} from '../../../../packages/ui/components';
import {displayDate} from '../../../../packages/domain/index';
export default function Notifications(){const d=useWorkspace();return <><PageHeading eyebrow="Account activity" title="Notifications" description="Updates addressed to you across your authorised property relationships."/><section className="panel">{d.notifications.length?d.notifications.map(n=><article className="record-row" key={n.id}><div><h3>{n.title}</h3><p>{n.message}</p><p>{displayDate(n.created_at)}</p></div><Link className="button secondary small" to={n.href.startsWith('/')?n.href:new URL(n.href).pathname}>View update</Link></article>):<EmptyState title="You are up to date" description="New reports and service updates will appear here."/>}</section></>;}
