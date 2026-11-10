import { useOutletContext } from 'react-router';
import { HomeArrangementsSection } from '../components/home/HomeArrangementsSection';
import { HomeHero } from '../components/home/HomeHero';
import { HomeProcessSection } from '../components/home/HomeProcessSection';
import { HomeRecordSection } from '../components/home/HomeRecordSection';
import { HomeSectorsSection } from '../components/home/HomeSectorsSection';
import { HomeServicesSection } from '../components/home/HomeServicesSection';
import { MarketingCta } from '../components/marketing-ui';
import { seo } from '../lib/seo';

export const meta = () =>
  seo(
    'Property Inspections & On-Site Support — Western Australia',
    'Practical property inspections, condition reports, contractor access and property attendance in WA. On-site work, documented outcomes and connected records.',
    '/',
  );

export default function Home() {
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  return (
    <div className="pi-home">
      <HomeHero appOrigin={appOrigin} />
      <HomeServicesSection />
      <HomeSectorsSection />
      <HomeProcessSection />
      <HomeRecordSection />
      <HomeArrangementsSection appOrigin={appOrigin} />
      <MarketingCta
        title="Have a property task to arrange?"
        description="Choose a service or tell us what needs doing. We will confirm the practical next step."
        appOrigin={appOrigin}
      />
    </div>
  );
}
