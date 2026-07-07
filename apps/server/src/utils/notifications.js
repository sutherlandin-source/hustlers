import EventEmitter from "events";
import { logger } from "./logger.js";

class Notifications extends EventEmitter {
  constructor() {
    super();
    // basic listeners can be attached here or by other modules
    this.on("milestone.approved", ({ milestone }) => {
      logger.info(`Notification: milestone approved ${milestone._id}`);
      // integrate with email/SMS/push providers here
    });
    this.on("contract.created", ({ contract }) => {
      logger.info(`Notification: contract created ${contract._id}`);
    });
  }

  async sendEmail(to, subject, body) {
    logger.info(`sendEmail to=${to} subject=${subject}`);
    // placeholder - wire into real email provider
    return true;
  }
}

export const notifications = new Notifications();
