# Nuonuo Invoice API Overview

Public doc sources used to build this skill:

- Sidebar: `https://jss.com.cn/open/api/interplatform/getSidebar.do`
- Direct issuance doc: `https://jss.com.cn/open/#/api-doc/common-api?id=100607`
- Legacy scan doc: `https://jss.com.cn/open/#/api-doc/common-api?id=100489`
- Legacy result query doc: `https://jss.com.cn/open/#/api-doc/common-api?id=100188`
- SaaS invoice list doc: `https://jss.com.cn/open/#/api-doc/common-api?id=100595`
- SaaS redelivery doc: `https://jss.com.cn/open/#/api-doc/common-api?id=100696`

## Shared Transport

Service URLs:

- Prod: `https://sdk.nuonuo.com/open/v1/services`
- Sandbox: `https://sandbox.nuonuocs.cn/open/v1/services`

Shared headers:

- `Content-type`
- `X-Nuonuo-Sign`
- `accessToken`
- `method`
- `userTax`:
  - optional for self-use apps
  - required for third-party apps

Shared envelope fields:

- `senid`: 32-char unique id
- `nonce`: 8-digit random positive integer
- `timestamp`: current Unix seconds
- `appkey`

## Core APIs

### Preferred direct issuance

- API id: `100607`
- Method: `nuonuo.OpeMplatform.requestBillingNew`
- Purpose: submit invoice payload directly and receive `invoiceSerialNum`

Minimal high-signal fields for the `order` object:

- `buyerName`
- `buyerTaxNum`
- `buyerTel`
- `buyerAddress`
- `buyerAccount`
- `salerTaxNum`
- `salerTel`
- `salerAddress`
- `salerAccount`
- `orderNo`
- `invoiceDate`
- `invoiceType`
- `invoiceLine`
- `pushMode`
- `buyerPhone`
- `email`
- `remark`
- `invoiceDetail[]`

Important line fields in `invoiceDetail[]`:

- `goodsName`
- `goodsCode`
- `num`
- `price`
- `taxRate`
- `tax`
- `taxExcludedAmount`
- `taxIncludedAmount`
- `invoiceLineProperty`
- `unit`
- `withTaxFlag`

Response:

- `invoiceSerialNum`

Example response:

```json
{
  "code": "E0000",
  "describe": "开票提交成功",
  "result": {
    "invoiceSerialNum": "20160108165823395151"
  }
}
```

Sandbox note from the doc:

- body `salerTaxNum` and header `userTax` should both be `339902999999789113`

### SaaS reconciliation

- API id: `100595`
- Method: `nuonuo.OpeMplatform.queryInvoiceList`
- Purpose: query invoice list in a time window

Key request fields:

- `taxnum`
- `requestType`
- `startTime`
- `endTime`
- `pageNo`
- `pageSize`

Important limits:

- time range must not exceed 10 days

Useful response fields:

- `totalCount`
- `invoices[].serialNo`
- `invoices[].orderNo`
- `invoices[].status`
- `invoices[].invoiceCode`
- `invoices[].invoiceNo`
- `invoices[].pdfUrl`

### SaaS re-delivery

- API id: `100696`
- Method: `nuonuo.OpeMplatform.deliveryInvoice`
- Purpose: re-deliver an issued invoice by phone or email

Key request fields:

- `taxnum`
- `invoiceCode`
- `invoiceNum`
- `phone`
- `mail`

Rule:

- `phone` and `mail` cannot both be empty

## Legacy Scan Flow

### Create scan request

- API id: `100489`
- Method: `nuonuo.ElectronInvoice.saveScanTemp`
- Purpose: push order data so the consumer can scan and issue later

High-signal request fields:

- `orderNo`
- `salerTaxNum`
- `salerAddress`
- `salerTel`
- `salerAccount`
- `clerk`
- `payee`
- `checker`
- `invoiceDate`
- `orderTotal`
- `remark`
- `buyerName`
- `buyerTaxNum`
- `buyerAccount`
- `notifyEmail`
- `buyerTel`
- `buyerAddress`
- `notifyPhone`

### Query result

- API id: `100188`
- Method: `nuonuo.ElectronInvoice.queryInvoiceResult`
- Purpose: query invoice result by serial number or order number

Key request fields:

- `serialNos`
- `orderNos`
- `isOfferInvoiceDetail`
- `isOfferBlueDetailIndex`

Status values called out in the doc:

- `2`: invoice completed
- `20`: invoicing
- `21`: invoiced, signing
- `22`: invoice failed
- `24`: sign failed
- `3`: voided
- `31`: voiding

Key response fields:

- `serialNo`
- `orderNo`
- `status`
- `statusMsg`
- `failCause`
- `pdfUrl`
- `pictureUrl`
- `invoiceTime`
- `invoiceCode`
- `invoiceNo`

## Suggested Build Order

For a new integration, prefer this sequence:

1. Build shared request client and signing integration.
2. Implement `100607` submission.
3. Store `orderNo` + `invoiceSerialNum`.
4. Implement reconciliation via `100595`.
5. Implement re-delivery via `100696`.
6. Only add `100489` + `100188` if the business explicitly uses scan-based issuance.

## Good Defaults

- Use official SDK examples as the baseline wire format.
- Keep invoice submission and invoice reconciliation as separate service methods.
- Make status reconciliation retryable and idempotent.
- Map Nuonuo status codes into internal domain statuses once, in one place.
