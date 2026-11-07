import { kasumiContent, sharedTailwindConfig } from "@kasumi/ui/tailwind-config";

export default {
  ...sharedTailwindConfig,
  content: ["./web/index.html", "./web/src/**/*.{js,jsx}", ...kasumiContent],
};
