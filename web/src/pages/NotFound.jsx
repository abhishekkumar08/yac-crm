import { Link } from "react-router-dom";
import { Button, EmptyState } from "@kasumi/ui";
import { COPY } from "@/copy.js";

export default function NotFound() {
  return (
    <EmptyState titleAs="h1" title={COPY.COMMON.NOT_FOUND}
      action={<Button as={Link} to="/" variant="secondary">{COPY.SHELL.PAGES["@home"]}</Button>} />
  );
}
