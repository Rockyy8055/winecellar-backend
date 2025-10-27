# UPS Integration Setup - Quick Guide

## ✅ COMPLETED (Backend Code)

All backend code is ready! Here's what was done:

1. **Automatic UPS shipment creation** when orders are placed
2. **UPS tracking service** to fetch tracking updates
3. **Admin routes** to manage shipments
4. **Webhook endpoint** for UPS to send updates
5. **Order status syncing** with UPS tracking

---

## 🔧 YOUR TODO LIST

### Step 1: Get UPS API Credentials

1. Go to: **https://developer.ups.com/**
2. Sign up for a developer account
3. Create a new app
4. Get these credentials:
   - **Client ID**
   - **Client Secret**
   - **UPS Account Number** (your shipping account)

### Step 2: Update Your Local `.env` File

Add these lines to your `.env` file:

```env
# UPS API Configuration
UPS_BASE_URL=https://wwwcie.ups.com
UPS_CLIENT_ID=paste_your_client_id_here
UPS_CLIENT_SECRET=paste_your_client_secret_here
UPS_ACCOUNT_NUMBER=paste_your_account_number_here

# Your Warehouse Address (London)
SHIPPER_NAME=Wine Cellar Ltd
SHIPPER_PHONE=+44XXXXXXXXXX
SHIPPER_ADDRESS_LINE1=Your warehouse address
SHIPPER_CITY=London
SHIPPER_POSTCODE=Your postcode
SHIPPER_COUNTRY=GB
```

**Note:** For production, change `UPS_BASE_URL` to `https://onlinetools.ups.com`

### Step 3: Update Render Environment Variables

1. Go to: **https://dashboard.render.com**
2. Select your backend service
3. Go to **Environment** tab
4. Add all the UPS variables from above
5. Click **Save Changes** (Render will auto-redeploy)

### Step 4: Test It

1. Restart your local server
2. Place a test order
3. Check the order has:
   - `carrier: "UPS"`
   - `carrierTrackingNumber: "1Z..."`
   - `status: "CONFIRMED"`

---

## 🎯 How It Works Now

### When Customer Places Order:

```
1. Order created → Status: PLACED
2. UPS shipment created automatically → Status: CONFIRMED
3. UPS tracking number saved to order
4. Customer gets email with tracking info
```

### Order Status Flow:

```
PLACED → CONFIRMED → PICKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
```

---

## 📡 New API Endpoints

### Admin Endpoints:

**Manually create UPS shipment:**
```
POST /api/admin/orders/:orderId/create-shipment
```

**Sync single order with UPS:**
```
POST /api/admin/ups/sync-order/:orderId
```

**Sync all active orders:**
```
POST /api/admin/ups/sync-all
```

### Public Endpoints:

**Get UPS tracking info:**
```
GET /api/ups/track/:upsTrackingNumber
```

**UPS webhook (for UPS to call):**
```
POST /api/ups/webhook
```

---

## 🔄 Keeping Orders Updated

### Option 1: UPS Webhooks (Recommended)

Configure in UPS Developer Portal:
- **Webhook URL**: `https://winecellar-backend.onrender.com/api/ups/webhook`
- UPS will automatically notify you of status changes

### Option 2: Manual Sync

Call this endpoint periodically (or set up a cron job):
```
POST /api/admin/ups/sync-all
```

---

## 🚨 Important Notes

- **Pick & Pay orders** won't create UPS shipments (customer pickup)
- If UPS shipment fails, order still gets created (you can create shipment manually later)
- Test in sandbox first before going to production
- All UPS credentials should be kept secret (never commit to Git)

---

## 📞 Support

If you get errors:
1. Check all environment variables are set
2. Verify UPS credentials are correct
3. Make sure shipper address is complete
4. Check server logs for detailed error messages

---

## ✅ Checklist

- [ ] UPS Developer account created
- [ ] API credentials obtained
- [ ] Local `.env` updated
- [ ] Render environment variables updated
- [ ] Server restarted/redeployed
- [ ] Test order placed successfully
- [ ] UPS tracking number generated
- [ ] Order status updates working
