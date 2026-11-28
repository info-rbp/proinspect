import { EditorialHero } from '../components/editorial';
import { seo } from '../lib/seo';
export const meta = () => seo('Co-Working', 'Explore Co-Working within ProInspect Co-Spaces.', '/co-spaces/co-working', { noindex: true });
export default function CoWorking() {
  return <EditorialHero eyebrow="Co-Spaces" title="Co-Working" image="co-working"/>;
}
