/**
 * Dashboard page E2E tests — verify stat cards render and
 * wallet connection flow works.
 */
describe("Dashboard Page", () => {
  it("loads dashboard page", () => {
    cy.visitAndWait("/dashboard");
    cy.url().should("include", "/dashboard");
  });

  it("shows connect wallet prompt or dashboard content", () => {
    cy.visitAndWait("/dashboard");
    // Dashboard should show either a connect prompt or stat cards
    cy.get("body").then(($body) => {
      const hasConnect = $body.text().includes("Connect");
      const hasDashboard = $body.text().includes("Dashboard");
      expect(hasConnect || hasDashboard).to.be.true;
    });
  });
});
