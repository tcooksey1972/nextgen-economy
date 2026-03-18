/**
 * Navigation E2E tests — verify all routes render correctly and
 * navigation between pages works.
 */
describe("Navigation", () => {
  it("loads the landing page", () => {
    cy.visitAndWait("/");
    cy.contains("NGE").should("be.visible");
  });

  it("navigates to all marketing pages", () => {
    cy.visitAndWait("/");

    cy.contains("Use Cases").click();
    cy.url().should("include", "/use-cases");

    cy.contains("About").click();
    cy.url().should("include", "/about");

    cy.contains("Demo").click();
    cy.url().should("include", "/demo");
  });

  it("navigates to all app pages", () => {
    cy.visitAndWait("/");

    cy.contains("Dashboard").click();
    cy.url().should("include", "/dashboard");

    cy.contains("Token").click();
    cy.url().should("include", "/token");

    cy.contains("Devices").click();
    cy.url().should("include", "/devices");

    cy.contains("Governance").click();
    cy.url().should("include", "/governance");

    cy.contains("Onboard").click();
    cy.url().should("include", "/onboard");
  });

  it("shows Connect Wallet button when not connected", () => {
    cy.visitAndWait("/");
    cy.contains("Connect Wallet").should("be.visible");
  });

  it("navbar logo links to home", () => {
    cy.visitAndWait("/about");
    cy.get("nav").contains("NGE").click();
    cy.url().should("eq", Cypress.config("baseUrl") + "/");
  });
});
