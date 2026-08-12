import { redirect } from "next/navigation";

// /blog used to re-export the Thoughts page wholesale, serving identical
// content on two URLs under two different names. /thoughts is the canonical
// URL (it is what the page calls itself); this route only forwards.
export default function BlogRedirect() {
  redirect("/thoughts");
}
