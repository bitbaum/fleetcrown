"use client";

import { useState, Suspense } from "react";
import { ProfileSettings } from "./ProfileSettings";
import { AccountSettings } from "./AccountSettings";
import { LocationSettings } from "./LocationSettings";
import { AgentTokenSettings } from "./AgentTokenSettings";
import { BeaconSettings } from "./BeaconSettings";
import { BillingSettings } from "./BillingSettings";
import { ProjectsSettings } from "./ProjectsSettings";
import { TeamSettings } from "./TeamSettings";
import type { UserPreferencesData } from "@/db/queries/user-preferences";
import type { Plan } from "@/db/schema/users";
import type { UserProject, Invitation } from "@/db/schema";

type Props = {
  user: {
    id: string;
    name: string;
    username: string;
    image: string;
    email: string | null;
    hasPassword: boolean;
    plan: Plan;
    planStatus: string | null;
    stripeReady: boolean;
    hasSubscription: boolean;
  };
  userPrefs: UserPreferencesData;
  projects: UserProject[];
  teamProjects: UserProject[];
  projectLimit: number | null;
  invitations: Invitation[];
};

const TABS = [
  { id: "profile",   label: "Profile"   },
  { id: "account",   label: "Account"   },
  { id: "location",  label: "Location"  },
  { id: "agent",     label: "Agent"     },
  { id: "projects",  label: "Projects"  },
  { id: "team",      label: "Team"      },
  { id: "billing",   label: "Billing"   },
] as const;

type TabId = typeof TABS[number]["id"];

export function SettingsTabs({ user, userPrefs, projects, teamProjects, projectLimit, invitations }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  return (
    <div>
      {/* Tab nav */}
      <div className="border-b border-border-subtle -mx-4 px-4 mb-6 overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`ui-tab ${activeTab === tab.id ? "ui-tab-active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "profile" && (
        <ProfileSettings user={{ id: user.id, name: user.name, username: user.username, image: user.image }} />
      )}
      {activeTab === "account" && (
        <AccountSettings user={{ email: user.email, hasPassword: user.hasPassword }} />
      )}
      {activeTab === "location" && (
        <LocationSettings initialPrefs={userPrefs} />
      )}
      {activeTab === "agent" && (
        <div className="space-y-6">
          <AgentTokenSettings />
          <BeaconSettings />
        </div>
      )}
      {activeTab === "projects" && (
        <ProjectsSettings
          projects={projects}
          teamProjects={teamProjects}
          projectLimit={projectLimit}
        />
      )}
      {activeTab === "team" && (
        <TeamSettings invitations={invitations} />
      )}
      {activeTab === "billing" && (
        <Suspense>
          <BillingSettings
            plan={user.plan}
            planStatus={user.planStatus}
            stripeReady={user.stripeReady}
            hasSubscription={user.hasSubscription}
          />
        </Suspense>
      )}
    </div>
  );
}
