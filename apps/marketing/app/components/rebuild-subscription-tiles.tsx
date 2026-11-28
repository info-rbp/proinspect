import { REBUILD_SUBSCRIPTION_TITLES } from '../../../../packages/marketing/rebuild-subscriptions';
export function RebuildSubscriptionTiles() {
  return <div className="pi-rebuild-subscription-grid">
    {REBUILD_SUBSCRIPTION_TITLES.map(title =>
      <article className="pi-plan-card pi-rebuild-subscription-card" key={title}><h3>{title}</h3></article>
    )}
  </div>;
}
