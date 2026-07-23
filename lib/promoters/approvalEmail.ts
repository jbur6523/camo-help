export function promoterApprovalEmailText(promotionName: string) {
  return [
    "Your CAMO-Help promoter registration has been approved.",
    "",
    ...(promotionName ? [`Promotion: ${promotionName}`, ""] : []),
    "You can now log in using the email and password you selected during registration.",
    "",
    "CAMO-Help administrators cannot view or set your password."
  ].join("\n");
}
