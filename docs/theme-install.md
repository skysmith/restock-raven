# Theme Install (Duplicate Theme + Kill Switch)

## 1. Duplicate theme
In Shopify admin, duplicate your live theme and work only in the duplicate.

## 2. Add kill switch setting
In `config/settings_schema.json`, add:
```json
{
  "name": "Restock Raven",
  "settings": [
    {
      "type": "checkbox",
      "id": "enable_restock_raven",
      "label": "Enable Restock Raven",
      "default": false
    }
  ]
}
```

## 3. Add snippet
Create snippet file with contents from:
- `theme/restock-raven-snippet.liquid`

## 4. Render snippet on product template
In product template/section (duplicate theme only), render:
```liquid
{% render 'restock-raven-snippet' %}
```

## 5. Point snippet to Vercel backend
In theme layout (or script tag), set:
```html
<script>
  window.restockRavenEndpoint = "https://<your-vercel-domain>/api/restock/subscribe";
</script>
```

## 6. Safety rollout
- Keep `enable_restock_raven = false` on live theme.
- Enable only in duplicate theme first.
- After validation, publish duplicate theme and keep toggle ready for instant disable.
