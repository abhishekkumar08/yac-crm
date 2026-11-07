import { COPY } from "@/copy.js";

export const dangerConfirm = (title, description, confirmText = COPY.COMMON.DELETE) => ({
  title, description, confirmText, cancelText: COPY.COMMON.CANCEL, variant: "error",
});
