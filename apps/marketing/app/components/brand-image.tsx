import residentialSmall from './images/residential-small.webp';
import residential from './images/residential.webp';
import commercialSmall from './images/commercial-small.webp';
import commercial from './images/commercial.webp';
import strataSmall from './images/strata-small.webp';
import strata from './images/strata.webp';
import coLivingSmall from './images/co-living-small.webp';
import coLiving from './images/co-living.webp';
import constructionSmall from './images/construction-small.webp';
import construction from './images/construction.webp';
import leasingSmall from './images/leasing-small.webp';
import leasing from './images/leasing.webp';
import maintenanceSmall from './images/maintenance-small.webp';
import maintenance from './images/maintenance.webp';
import coworking from './images/co-working.jpg';
import coworkingSmall from './images/co-working-small.jpg';
import modular from './images/modular.jpg';
import modularSmall from './images/modular-small.jpg';

const imagery = {
  residential: {
    src: residential,
    small: residentialSmall,
    alt: 'Limestone home with a shaded entrance and native garden',
  },
  commercial: {
    src: commercial,
    small: commercialSmall,
    alt: 'Contemporary commercial building with a landscaped entrance',
  },
  strata: {
    src: strata,
    small: strataSmall,
    alt: 'Apartment buildings around a landscaped shared courtyard',
  },
  'co-living': {
    src: coLiving,
    small: coLivingSmall,
    alt: 'Welcoming shared kitchen, dining and living space',
  },
  'co-working': {
    src: coworking, small: coworkingSmall,
    alt: 'Illustrative contemporary co-working office with oak desks, greenery and natural daylight',
  },
  modular: {
    src: modular, small: modularSmall,
    alt: 'Illustrative modern modular building with timber cladding and native landscaping',
  },
  construction: {
    src: construction,
    small: constructionSmall,
    alt: 'Residential construction site with unfinished walls and roof framing',
  },
  leasing: {
    src: leasing,
    small: leasingSmall,
    alt: 'Light-filled apartment living room opening onto a garden courtyard',
  },
  maintenance: {
    src: maintenance,
    small: maintenanceSmall,
    alt: 'Well maintained timber window and entrance against a limestone wall',
  },
};

export type BrandImageKey = keyof typeof imagery;

export function BrandImage({
  name,
  priority = false,
  className = '',
}: {
  name: BrandImageKey;
  priority?: boolean;
  className?: string;
}) {
  const originalConcept = name === 'co-working' || name === 'modular';
  return (
    <img
      className={'pi-brand-image ' + className}
      src={imagery[name].src}
      alt={imagery[name].alt}
      srcSet={imagery[name].small + ' 600w, ' + imagery[name].src + (originalConcept ? ' 1152w' : ' 1200w')}
      sizes="(max-width: 600px) 100vw, (max-width: 800px) 85vw, 50vw"
      width={originalConcept ? 1152 : 1200}
      height={originalConcept ? 896 : 800}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
    />
  );
}
