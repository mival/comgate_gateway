/* global process */

const crypto = require("crypto");
// const rp = require('request-promise-native');
const fetch = require("node-fetch");
const FormData = require("form-data");
const RSVP = require("rsvp");

fetch.Promise = RSVP.Promise;

class APIError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "APIError";
  }
}

class PaymentError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "PaymentError";
  }
}

const ComgatePaymentModule = class ComgatePaymentModule {
  /**
   * Creates an instance payment module.
   *
   * @param {boolean} useTest Use testing environment (default: false).
   * @param {string} gateUrl URL of gate API (default: https://payments.comgate.cz).
   * @param {string} apiVersion Version of payment API (default: 1.0).
   * @param {string} country Use testing environment (default: CZ).
   * @param {string} currency Use testing environment (default: CZK).
   * @param {string} language Use testing environment (default: cs).
   * @param {string} merchantId Merchand id from comgate portal.
   * @param {string} secret API key from comgate portal.
   */
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
      currency: config.currency || "CZK",
      language: config.language || "cs",
      country: config.country || "CZ",
    };

    configuration.gateUrl = `${
      config.gateUrl || process.env.GATEWAY_URL || "https://payments.comgate.cz"
    }/v${configuration.apiVersion}`;

    this.config = configuration;
  }

  _makeAPICall(path, data, method = "POST") {
    const params = {
      method,
    };

    if (data) {
      const formData = new FormData();
      formData.append("type", "json");
      Object.keys(data).forEach((key) => {
        formData.append(key, (data[key] || "").toString());
      });
      params.body = formData;
      params.headers = formData.getHeaders();
      params.headers.accept = "application/json";
    }

    return fetch(`${this.config.gateUrl}/${path}`, params).then((res) => {
      const contentType = res.headers.get("content-type");
      const isJSON = contentType.includes("application/json");

      if (!res.ok) {
        return res.text().then((errorBody) => {
          return RSVP.reject(new APIError(errorBody, res.status));
        });
      }

      try {
        if (isJSON) {
          return res.json().then((json) => {
            if (json.error) {
              return RSVP.reject(
                new APIError(JSON.stringify(json.error), res.status)
              );
            }

            return json;
          });
        } else {
          return res.text().then((payload) => {
            // response is url encodes string
            if (
              contentType.includes("form-urlencoded") ||
              contentType.includes("text/html")
            ) {
              const urlParams = new URLSearchParams(payload);
              const out = {};
              urlParams.forEach((value, key) => {
                out[key] = value;
              });
              if (out.code !== "0") {
                return RSVP.reject(new PaymentError(out.message, out.code));
              }
              delete out.code;
              delete out.message;
              return out;
            }
            return payload;
          });
        }
      } catch (error) {
        return RSVP.reject(new APIError(error, res.status));
      }
    });
  }

  /**
   * Returns available payment methods
   */
  methods() {
    const { merchantId, secret, language, currency, country } = this.config;
    return this._makeAPICall("methods", {
      merchant: merchantId,
      secret,
      lang: language,
      curr: currency,
      country,
    });
  }

  /**
   * Create new payment
   *
   * @param {integer} price Price to pay.
   * @param {string} label Product description.
   * @param {string} refId Reference id.
   * @param {string} method Payment method to use.
   * @param {string} account Client account number to use.
   * @param {string} email User email (used for reclamation).
   * @param {string} phone User phone (used for reclamation).
   * @param {boolean} prepareOnly If used in background set to true.
   * @param {boolean} preauth .
   * @param {boolean} initRecurring .
   * @param {boolean} verification .
   * @param {boolean} eetReport .
   * @param {json} eetData .
   * @param {string} embedded .
  */
  create(params) {
    const {
      merchantId,
      secret,
      language,
      currency,
      country,
      useTest,
    } = this.config;
    let paymentParams = {
      ...{
        merchant: merchantId,
        test: useTest,
        country,
        curr: currency,
        secret,
        lang: language,
        method: "ALL",
      },
      ...params,
    };

    return this._makeAPICall("create", paymentParams);
  }

  /**
   * Cancel payment
   *
   * @param {string} transactionId Transaction id to cancel.
  */
  cancel(transactionId) {
    const { merchantId, secret } = this.config;
    return this._makeAPICall("cancel", {
      merchant: merchantId,
      transId: transactionId,
      secret,
    });
  }

  /**
   * Refund payment
   *
   * @param {string} transactionId Transaction id to cancel.
   * @param {integer} amount Amount to.
   * @param {boolean} test Is testing transaction.
   * @param {string} refId Reference id.
   *
  */
  refund(transactionId, params) {
    const { merchantId, secret, useTest, currency } = this.config;
    const { amount } = params;
    delete params.amount;

    return this._makeAPICall("refund", {
      ...{
        merchant: merchantId,
        transId: transactionId,
        secret,
        test: useTest.toString(), // API chce string
        curr: currency,
        amount: (amount || '').toString() // API chce string
      },
      ...params,
    });
  }

  /**
   * Get status of payment
   *
   * @param {string} transactionId Transaction id to get info about.
  */
  status(transactionId) {
    const { merchantId, secret } = this.config;
    return this._makeAPICall("status", {
      merchant: merchantId,
      transId: transactionId,
      secret,
    });
  }
};

module.exports.ComgatePaymentModule = ComgatePaymentModule;
