import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

describe("HR Terra", () => {
  it("shows a sign-in form when there is no authenticated session", async () => {
    global.fetch = async () =>
      new Response(JSON.stringify({ error: { message: "Please sign in" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: "Sign in to your workspace" }),
    ).toBeInTheDocument();
  });
});
