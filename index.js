/* global process */

const crypto = require("crypto");
// const rp = require('request-promise-native');
const fetch = require("node-fetch");
const FormData = require('form-data');
const RSVP = require("rsvp");

fetch.Promise = RSVP.Promise;

class APIError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "APIError";
  }
}

const ComgatePaymentModule = class ComgatePaymentModule {
  constructor(config = {}) {
    this.logger = config.logging
      ? typeof config.logging === "function"
        ? config.logging
        : console.log
      : function () {};

    const configuration = {
      secret: config.secret || process.env.MERCHANT_SECRET,
      bankPublicKey: config.bankPublicKey || process.env.BANK_PUBLIC_KEY,
      calbackUrl: config.calbackUrl || process.env.CALLBACK_URL,
      useTest: config.useTest || process.env.USE_TEST || false,
      merchantId: config.merchantId || process.env.MERCHANT_ID,
      apiVersion: config.apiVersion || process.env.API_VERSION || "1.0",
      currency: config.apiVersion.currency || 'CZK',
      language: config.apiVersion.language || 'cs',
      country: config.apiVersion.country || 'CZ'
    };

    configuration.gateUrl = `${(config.gateUrl || process.env.GATEWAY_URL)}/v${configuration.apiVersion}`;

    const PAYLOAD_TEMPLATE = {
      merchantId: configuration.merchantId,
      payOperation: "payment",
      payMethod: "card",
      currency: "CZK",
      language: "CZ",
      returnUrl: configuration.calbackUrl,
      returnMethod: "POST",
    };

    configuration.payloadTemplate = PAYLOAD_TEMPLATE;
    this.config = configuration;
  }

  _makeAPICall(path, data, method = 'POST') {
    const params = {
      method
    };

    if (data) {
      const formData = new FormData();
      formData.append("type", "json");
      Object.keys(data).forEach(key => {
        formData.append(key, data[key] || '');
      })
      params.body = formData;
      params.headers = formData.getHeaders();
    };

    return fetch(`${this.config.gateUrl}/${path}`, params).then(res => {
      if (!res.ok) {
        return res.text().then(errorBody => {
          return RSVP.reject(new APIError(errorBody, res.status));
        })
      }
      return res.json().then(json => {
        if (json.error) {
          return RSVP.reject(new APIError(JSON.stringify(json.error), res.status));
        }

        return json;
      });
    });
  }

  methods() {
    const { merchantId, secret, language, currency, country } = this.config;
    return this._makeAPICall('methods', {
      merchant: merchantId,
      secret,
      lang: language,
      curr: currency,
      country
    });
  }

  status(transactionId) {
    const { merchantId, secret } = this.config;
    return this._makeAPICall('methods', {
      merchant: merchantId,
      transId: transactionId,
      secret
    });
  }

  // payOrder(order, close = true, options = {}) {
  //   const payload = Object.assign(options, this.config.payloadTemplate);
  //   payload["orderNo"] = order.id;
  //   payload["dttm"] = this._createDttm();
  //   payload["description"] = order.description;
  //   payload["cart"] = order.items;
  //   payload["totalAmount"] = order.items.reduce(
  //     (sum, item) => sum + item.amount,
  //     0
  //   );
  //   payload["closePayment"] = close;
  //   if (order.merchantData) {
  //     payload["merchantData"] = Buffer.from(order.merchantData).toString(
  //       "base64"
  //     );
  //   }
  //   this.logger("payOrder", payload);
  //   return this.init(payload).then((result) => {
  //     this.logger("payOrder - result", result);
  //     return this.getRedirectUrl(result.payId);
  //   });
  // }

  // verifyResult(result) {
  //   return new RSVP.Promise((resolve, reject) => {
  //     if (result.resultCode.toString() === "0") {
  //       if (this._verify(this._createResultMessage(result), result.signature)) {
  //         this.logger("verifyResult", result);
  //         result["merchantData"] = Buffer.from(
  //           result.merchantData,
  //           "base64"
  //         ).toString("ascii");
  //         resolve(result);
  //       } else {
  //         reject(Error("Verification failed"));
  //       }
  //     } else {
  //       reject(result);
  //     }
  //   });
  // }
};

module.exports.ComgatePaymentModule = ComgatePaymentModule;
