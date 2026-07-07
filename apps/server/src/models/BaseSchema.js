/**
 * Base Schema
 * Shared schema structure for all models
 */

/**
 * Common schema options for all models
 */
export function getBaseSchemaOptions() {
  return {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
  };
}

/**
 * Base fields included in all models
 */
export const baseFields = {
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
};
