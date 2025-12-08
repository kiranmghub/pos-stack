# Testing WebhookTestModal Component

## Prerequisites

1. **Backend server running** on port 8000 (default)
2. **Frontend server running** on port 5173 (default Vite)
3. **Webhook testing endpoint** - You'll need a URL to receive webhooks

## Quick Setup for Testing

### Option 1: Use webhook.site (Easiest)
1. Go to https://webhook.site
2. Copy the unique URL provided (e.g., `https://webhook.site/your-unique-id`)
3. Use this URL as your webhook endpoint

### Option 2: Use ngrok (Local testing)
1. Install ngrok: https://ngrok.com/download
2. Run a local server that can receive POST requests (or use webhook.site above)
3. Expose it: `ngrok http 3000` (or your server port)
4. Use the ngrok URL as your webhook endpoint

### Option 3: Use a public webhook tester
- https://requestbin.com/
- https://httpbin.org/post
- Any service that shows incoming HTTP requests

## Step-by-Step Testing Guide

### 1. Start the Backend Server

```bash
cd pos-backend
python manage.py runserver
```

The server should start on `http://localhost:8000`

### 2. Start the Frontend Server

```bash
cd pos-frontend
npm install  # If not already done
npm run dev
```

The frontend should start on `http://localhost:5173` (or the configured port)

### 3. Log In to the Application

1. Open `http://localhost:5173` in your browser
2. Log in with your credentials
3. Navigate to the Inventory section

### 4. Navigate to Webhooks Page

1. In the Inventory section, go to **Settings** → **Webhooks**
   - Or navigate directly to the webhooks route

### 5. Create a Webhook Subscription (If None Exist)

1. Click the **"New Webhook"** button
2. Fill in the form:
   - **Webhook URL**: Use your test endpoint (e.g., from webhook.site)
   - **Event Types**: Select one or more event types to test:
     - `inventory.stock_changed`
     - `inventory.transfer_sent`
     - `inventory.transfer_received`
     - `inventory.count_finalized`
     - `purchase_order.received`
   - **Description**: (Optional) "Test webhook"
   - **Max Retries**: 3 (default)
   - **Retry Backoff**: 60 seconds (default)
3. Click **"Create"**
4. **Important**: Save the webhook secret if shown (you'll need it to verify signatures)

### 6. Test the Webhook

1. In the webhooks subscriptions list, find your subscription
2. Click the **Play button** (▶️) in the actions column (first button)
3. The **WebhookTestModal** should open

### 7. In the Test Modal

1. **Select Event Type**: Choose which event type to test (dropdown shows only event types configured for this subscription)
2. Click **"Send Test Webhook"** button
3. Wait for the response (loading spinner will show)

### 8. Verify the Results

The modal will show:

#### Success Case:
- ✅ Green success indicator
- Status: `SUCCESS`
- Response code: `200` (or other 2xx)
- **Payload tab**: Shows the JSON payload that was sent
- **Response tab**: Shows delivery details including:
  - `delivery_id`
  - `status`
  - `response_status_code`
  - `delivered_at` timestamp

#### Failure Case:
- ❌ Red error indicator
- Status: `FAILED` or `RETRYING`
- Error message explaining what went wrong
- Response code (if available)

### 9. Verify on Your Test Endpoint

1. If using webhook.site:
   - Check the webhook.site page for the incoming request
   - Verify the payload structure
   - Check headers:
     - `X-Webhook-Event`: Event type
     - `X-Webhook-Signature`: SHA256 signature
     - `X-Webhook-Delivery-Id`: Delivery ID
     - `Content-Type`: `application/json`

2. Verify the payload matches what's shown in the modal's Payload tab

### 10. Test Different Event Types

1. Select a different event type from the dropdown
2. Click "Send Test Webhook" again
3. Verify the payload structure changes based on event type

### 11. Test Features

- **Copy Payload**: Click "Copy" button in Payload tab → Paste somewhere to verify
- **Copy Response**: Click "Copy" button in Response tab → Paste to verify
- **Multiple Tests**: Send multiple test webhooks and verify each one
- **Check Delivery Logs**: Go back to the main webhooks page and check if test deliveries appear in the delivery logs

## Expected Behavior

### Success Flow:
1. Modal opens with subscription URL displayed
2. Event type dropdown populated with configured event types
3. User selects event type and clicks "Send Test Webhook"
4. Loading state shows "Sending Test..."
5. Success/Error result displayed with visual indicators
6. Payload and Response tabs show detailed information
7. Copy buttons work correctly
8. Delivery appears in delivery logs (refresh if needed)

### Error Scenarios to Test:
1. **Invalid URL**: Edit subscription with invalid URL, then test
2. **Unreachable endpoint**: Use a URL that doesn't exist
3. **Timeout**: Use a slow-responding endpoint
4. **No event types**: Try testing subscription with no event types (should disable button)

## API Endpoint Testing

You can also test the API endpoint directly:

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/subscriptions/1/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: YOUR_TENANT_ID" \
  -d '{"event_type": "inventory.stock_changed"}'
```

Response:
```json
{
  "success": true,
  "delivery_id": 123,
  "event_type": "inventory.stock_changed",
  "payload": { ... },
  "status": "SUCCESS",
  "response_status_code": 200,
  "error_message": "",
  "attempt_count": 1,
  "delivered_at": "2024-12-06T..."
}
```

## Troubleshooting

### Modal doesn't open
- Check browser console for errors
- Verify the test button click handler is connected
- Check if subscription exists and has event types

### Test fails immediately
- Check backend server logs
- Verify webhook URL is accessible
- Check CORS settings if testing cross-origin

### Payload not showing
- Check browser console for errors
- Verify JSON is valid
- Try refreshing the modal

### Delivery not appearing in logs
- Refresh the deliveries list
- Verify subscription is selected
- Check backend logs for errors

## Sample Payload Structures

### inventory.stock_changed
```json
{
  "event": "inventory.stock_changed",
  "timestamp": "2024-12-06T...",
  "tenant_id": 1,
  "tenant_code": "tenant1",
  "data": {
    "store_id": 1,
    "store_code": "STORE1",
    "store_name": "Sample Store",
    "variant_id": 1,
    "sku": "TEST-SKU-001",
    "product_name": "Test Product",
    "old_on_hand": 10,
    "new_on_hand": 15,
    "delta": 5,
    "ref_type": "ADJUSTMENT",
    "ref_id": 999,
    "user_id": 1,
    "user_username": "testuser"
  }
}
```

### inventory.transfer_sent
```json
{
  "event": "inventory.transfer_sent",
  "timestamp": "2024-12-06T...",
  "tenant_id": 1,
  "tenant_code": "tenant1",
  "data": {
    "transfer_id": 999,
    "from_store_id": 1,
    "from_store_code": "STORE1",
    "to_store_id": 2,
    "to_store_code": "STORE2",
    "status": "SENT",
    "lines": [
      {
        "variant_id": 1,
        "sku": "TEST-SKU-001",
        "qty": 5,
        "qty_sent": 5
      }
    ],
    "user_id": 1,
    "user_username": "testuser"
  }
}
```

## Verification Checklist

- [ ] Modal opens when clicking test button
- [ ] Event type dropdown shows configured event types
- [ ] Can select different event types
- [ ] "Send Test Webhook" button is enabled/disabled correctly
- [ ] Loading state shows during request
- [ ] Success indicator appears for successful delivery
- [ ] Error indicator appears for failed delivery
- [ ] Payload tab shows correct JSON structure
- [ ] Response tab shows delivery details
- [ ] Copy buttons work for payload and response
- [ ] Delivery appears in delivery logs
- [ ] Webhook received at test endpoint
- [ ] Headers are correct (signature, event type, etc.)
- [ ] Multiple event types can be tested
- [ ] Modal closes correctly

---

**Note**: All webhook deliveries (including tests) are logged and can be viewed in the Delivery Logs section on the webhooks page.

