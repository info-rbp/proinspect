CREATE TABLE service_sale_variants (
 id TEXT PRIMARY KEY,
 service_id TEXT NOT NULL REFERENCES services(id),
 source_code TEXT NOT NULL,
 source_version TEXT NOT NULL,
 source_fee TEXT NOT NULL,
 label TEXT NOT NULL,
 scope_text TEXT NOT NULL,
 scope_sha256 TEXT NOT NULL CHECK(length(scope_sha256)=64),
 unit_ex_gst_cents INTEGER NOT NULL CHECK(unit_ex_gst_cents>0),
 minimum_cents INTEGER NOT NULL DEFAULT 0 CHECK(minimum_cents>=0),
 quantity_allowed INTEGER NOT NULL DEFAULT 0 CHECK(quantity_allowed IN(0,1)),
 gst_basis_points INTEGER NOT NULL CHECK(gst_basis_points IN(0,1000)),
 postcodes_json TEXT NOT NULL CHECK(json_valid(postcodes_json)),
 property_types_json TEXT NOT NULL CHECK(json_valid(property_types_json)),
 starts_at TEXT NOT NULL,
 expires_at TEXT NOT NULL CHECK(expires_at>starts_at),
 payment_policy TEXT NOT NULL CHECK(payment_policy='invoice_after_confirmation'),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','withdrawn')),
 created_by TEXT NOT NULL REFERENCES users(id),
 approved_by TEXT REFERENCES users(id),
 approved_at TEXT,
 approval_reference TEXT,
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX sale_variants_service_status ON service_sale_variants(service_id,status,starts_at,expires_at);
CREATE TRIGGER sale_variant_immutable BEFORE UPDATE ON service_sale_variants WHEN
 NEW.service_id!=OLD.service_id OR NEW.source_code!=OLD.source_code OR NEW.source_version!=OLD.source_version OR NEW.source_fee!=OLD.source_fee OR NEW.label!=OLD.label OR NEW.scope_text!=OLD.scope_text OR NEW.scope_sha256!=OLD.scope_sha256 OR NEW.unit_ex_gst_cents!=OLD.unit_ex_gst_cents OR NEW.minimum_cents!=OLD.minimum_cents OR NEW.quantity_allowed!=OLD.quantity_allowed OR NEW.gst_basis_points!=OLD.gst_basis_points OR NEW.postcodes_json!=OLD.postcodes_json OR NEW.property_types_json!=OLD.property_types_json OR NEW.starts_at!=OLD.starts_at OR NEW.expires_at!=OLD.expires_at OR NEW.payment_policy!=OLD.payment_policy OR NEW.created_by!=OLD.created_by OR NEW.created_at!=OLD.created_at
 BEGIN SELECT RAISE(ABORT,'PRICE_SCOPE_IMMUTABLE'); END;
CREATE TRIGGER sale_variant_approval BEFORE UPDATE ON service_sale_variants WHEN NEW.status='approved' AND OLD.status='draft' BEGIN
 SELECT CASE WHEN NEW.approved_by=OLD.created_by OR NEW.approved_at IS NULL OR length(COALESCE(NEW.approval_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 AND sp.role='administrator' WHERE u.id=NEW.approved_by AND u.active=1 AND u.verified_at IS NOT NULL) THEN RAISE(ABORT,'INDEPENDENT_PRICE_APPROVAL_REQUIRED') END;
END;
CREATE TRIGGER sale_variant_status BEFORE UPDATE ON service_sale_variants WHEN NOT((OLD.status='draft' AND NEW.status IN('approved','withdrawn')) OR (OLD.status='approved' AND NEW.status='withdrawn')) BEGIN SELECT RAISE(ABORT,'PRICE_STATUS_INVALID'); END;
CREATE TRIGGER sale_variant_no_delete BEFORE DELETE ON service_sale_variants BEGIN SELECT RAISE(ABORT,'PRICE_AUDIT_IMMUTABLE'); END;
ALTER TABLE guest_service_orders ADD COLUMN sale_variant_id TEXT REFERENCES service_sale_variants(id);
ALTER TABLE guest_service_orders ADD COLUMN sale_quantity INTEGER NOT NULL DEFAULT 1 CHECK(sale_quantity BETWEEN 1 AND 500);
ALTER TABLE guest_service_orders ADD COLUMN gst_cents INTEGER CHECK(gst_cents>=0);
ALTER TABLE guest_service_orders ADD COLUMN pricing_snapshot_json TEXT CHECK(pricing_snapshot_json IS NULL OR json_valid(pricing_snapshot_json));
