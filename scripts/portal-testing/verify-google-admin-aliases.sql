-- Read-only D1 check after seeding. Eight expected rows, each one workspace.
WITH access AS (
 SELECT u.email, e.workspace_kind AS portal
 FROM users u JOIN client_memberships m ON m.user_id=u.id AND m.active=1
 JOIN clients c ON c.id=m.client_id AND c.status='active'
 JOIN client_entitlements e ON e.client_id=c.id AND e.active=1
 WHERE u.email LIKE '%-testing@proinspect.systems'
 UNION ALL
 SELECT u.email,'tenant' FROM users u JOIN tenancy_memberships m ON m.user_id=u.id
 JOIN tenancies t ON t.id=m.tenancy_id
 WHERE u.email='tenant-testing@proinspect.systems' AND m.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 UNION ALL
 SELECT u.email,CASE WHEN m.role='council_member' THEN 'council' ELSE 'building' END
 FROM users u JOIN scheme_memberships m ON m.user_id=u.id
 WHERE u.email IN ('building-resident-testing@proinspect.systems','building-council-testing@proinspect.systems')
 AND m.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND (m.ends_at IS NULL OR m.ends_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 UNION ALL
 SELECT u.email,'staff' FROM users u JOIN staff_profiles p ON p.user_id=u.id AND p.active=1
 WHERE u.email='staff-testing@proinspect.systems'
), expected(email,portal) AS (
 VALUES
 ('landlord-testing@proinspect.systems','landlord'),
 ('property-manager-testing@proinspect.systems','property-manager'),
 ('strata-manager-testing@proinspect.systems','strata-manager'),
 ('tenant-testing@proinspect.systems','tenant'),
 ('building-resident-testing@proinspect.systems','building'),
 ('building-council-testing@proinspect.systems','council'),
 ('commercial-testing@proinspect.systems','commercial'),
 ('staff-testing@proinspect.systems','staff')
)
SELECT e.email,e.portal AS expected_portal,
 CASE WHEN u.id IS NULL THEN 'MISSING_USER'
      WHEN u.active!=1 THEN 'USER_DISABLED'
      WHEN a.portal IS NULL THEN 'MISSING_MEMBERSHIP'
      WHEN (SELECT COUNT(DISTINCT x.portal) FROM access x WHERE x.email=e.email)>1 THEN 'EXTRA_WORKSPACE_REVIEW'
      WHEN e.portal='staff' AND NOT EXISTS(SELECT 1 FROM staff_profiles sp WHERE sp.user_id=u.id AND sp.role='administrator' AND sp.active=1) THEN 'STAFF_ROLE_MISMATCH'
      WHEN e.portal IN ('landlord','property-manager','strata-manager','commercial') AND NOT EXISTS(SELECT 1 FROM client_memberships m JOIN client_entitlements ce ON ce.client_id=m.client_id AND ce.active=1 WHERE m.user_id=u.id AND m.active=1 AND m.role='owner' AND ce.workspace_kind=e.portal) THEN 'CLIENT_ROLE_MISMATCH'
      ELSE 'ACCESS_ASSIGNED' END AS portal_status,
 CASE WHEN u.verified_at IS NULL THEN 'EMAIL_NOT_YET_VERIFIED'
      ELSE 'EMAIL_VERIFIED' END AS sign_in_status
FROM expected e LEFT JOIN users u ON u.email=e.email
LEFT JOIN access a ON a.email=e.email AND a.portal=e.portal
ORDER BY e.portal;