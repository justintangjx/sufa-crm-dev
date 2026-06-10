import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { api, resetData } from "./data";
import { TestApp } from "./App";

describe("App routing", () => {
  beforeEach(() => {
    resetData();
  });

  it("lets an admin sign in and land on the admin dashboard", async () => {
    const user = userEvent.setup();
    render(<TestApp initialEntries={["/login"]} />);

    await user.type(screen.getByLabelText(/email/i), "admin@sufa.test");
    await user.click(screen.getByRole("button", { name: /send magic link/i }));

    expect(await screen.findByRole("heading", { name: /admin dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/total athletes/i)).toBeInTheDocument();
  });

  it("redirects a player away from admin routes", async () => {
    await api.signIn("alice@sufa.test");

    render(<TestApp initialEntries={["/admin"]} />);

    expect(await screen.findByRole("heading", { name: /player dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /admin dashboard/i })).not.toBeInTheDocument();
  });
});
