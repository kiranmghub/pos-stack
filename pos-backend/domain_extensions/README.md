# Domain Extensions

This Django app provides a framework for domain-specific customizations, allowing the core application to remain generic while supporting business/industry-specific features.

## Architecture

The domain extensions framework uses a registry pattern where each business domain can register an extension that provides domain-specific functionality.

### Key Components

1. **Registry** (`registry.py`): Central registry for domain extensions
2. **Base Extension Class** (`registry.py::DomainExtension`): Base class that all extensions inherit from
3. **Extension Implementations**: Domain-specific extensions (e.g., `telangana_liquor/`)

## Current Extensions

### Telangana Liquor Extension

Located in `telangana_liquor/`, this extension provides:

- **ICDC PDF Parsing**: Parse Invoice-cum-Delivery Challan PDFs from Telangana Government
- **Product Matching**: Match products/variants from PDF data
- **Inventory Posting**: Update inventory with special rules for liquor stores
- **Purchase Order Integration**: Create PurchaseOrders from ICDC invoices

#### Models

- `ICDCInvoice`: Main invoice model
- `ICDCInvoiceLine`: Line items from the invoice

#### Services

- `parser.py`: PDF parsing (text + OCR)
- `services.py`: Business logic (rounding, calculations, matching, posting)

#### API Endpoints

All endpoints are under `/api/v1/domain-extensions/telangana-liquor/icdc/`:

- `POST /parse` - Parse ICDC PDF
- `POST /save-draft` - Save invoice as draft
- `POST /{id}/submit` - Submit invoice (create PO, update inventory)
- `GET /` - List invoices
- `GET /{id}/` - Get invoice detail
- `PUT /{id}/` - Update invoice
- `DELETE /{id}/` - Delete invoice
- `POST /{id}/reverse` - Reverse invoice

## Adding New Domain Extensions

1. Create a new directory under `domain_extensions/` (e.g., `paints_industry/`)
2. Create an `extension.py` file with your extension class:

```python
from domain_extensions.registry import DomainExtension, register_extension

class PaintsIndustryExtension(DomainExtension):
    code = "paints_industry"
    name = "Paints Industry"
    version = "1.0.0"
    
    def is_enabled(self, tenant) -> bool:
        return super().is_enabled(tenant)
    
    def get_config(self, tenant) -> dict:
        return super().get_config(tenant)

def register_paints_industry_extension():
    extension = PaintsIndustryExtension()
    register_extension(extension)
    return extension
```

3. Register the extension in `apps.py`:

```python
def ready(self):
    from domain_extensions.telangana_liquor.extension import register_telangana_liquor_extension
    register_telangana_liquor_extension()
    
    from domain_extensions.paints_industry.extension import register_paints_industry_extension
    register_paints_industry_extension()
```

4. Create domain-specific models, services, and APIs as needed

## Configuration

Domain-specific configuration is stored in `Tenant.business_domain_config` as JSON.

Example for Telangana Liquor:
```json
{
  "telangana_liquor": {
    "rounding_mode": "nearest_0.50",
    "case_rate_rounding": true,
    "rate_tolerance": 0.50,
    "total_tolerance": 1.00,
    "icdc_enabled": true,
    "auto_create_products": false,
    "auto_update_variant_cost": false
  }
}
```

## Security

- All operations are tenant-scoped
- Feature flags check `tenant.business_domain` before allowing access
- Permissions and validation are enforced at the API level

## Testing

Run tests:
```bash
python manage.py test domain_extensions
```

## Migration Notes

After adding new domain extensions:
1. Run migrations: `python manage.py migrate`
2. Set `business_domain` on relevant tenants
3. Configure `business_domain_config` as needed

