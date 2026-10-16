"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  Bell,
  Heart,
  MessageSquareText,
  Pin,
  Radio,
  Star,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Project, StreamEvent } from "@/lib/types";
import styles from "./live.module.css";

export default function PublicLivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [latestAlert, setLatestAlert] = useState<StreamEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function loadPublicData() {
      // Fetch public project by slug
      const { data: projData, error: projError } = await supabase
        .from("projects")
        .select("*")
        .eq("slug", slug)
        .single();

      if (projError || !projData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProject(projData);

      // Fetch initial recent events
      const { data: eventsData } = await supabase
        .from("stream_events")
        .select("*")
        .eq("project_id", projData.id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (eventsData) {
        setEvents(eventsData);
      }

      setLoading(false);

      // Realtime subscription for incoming stream events
      const channel = supabase
        .channel(`public-events-${projData.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "stream_events",
            filter: `project_id=eq.${projData.id}`,
          },
          (payload) => {
            const newEv = payload.new as StreamEvent;
            setEvents((prev) => [newEv, ...prev]);

            // Trigger popup toast alert for new event
            setLatestAlert(newEv);
            setTimeout(() => {
              setLatestAlert(null);
            }, 5000);
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    loadPublicData();
  }, [slug]);

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
        <p>Connecting to live stream channel...</p>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className={styles.errorScreen}>
        <h1>Channel Not Found</h1>
        <p>This Kit Steam page does not exist or has been made private.</p>
        <Link href="/" className="btn btn-primary">
          Back to Kit Steam
        </Link>
      </div>
    );
  }

  const themeColor = project.theme_color || "var(--brand-primary)";

  // Total donation calculation
  const totalDonations = events
    .filter((e) => e.type === "donation" && e.amount)
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  return (
    <div className={styles.page}>
      {/* Background glow tailored to theme color */}
      <div
        className={styles.themeGlow}
        style={{
          background: `radial-gradient(circle, ${themeColor}33 0%, transparent 70%)`,
        }}
      />

      {/* Header */}
      <header className={styles.header}>
        <div className="container">
          <div className={styles.headerInner}>
            <div className={styles.channelMeta}>
              <div
                className={styles.themeBadge}
                style={{ background: themeColor }}
              />
              <div>
                <h1 className={styles.channelName}>{project.name}</h1>
                <p className={styles.channelSlug}>
                  Kit Steam.com/p/{project.slug}
                </p>
              </div>
            </div>

            <div className={styles.headerRight}>
              <span className="badge badge-green">
                <span className="live-dot" /> LIVE FEED
              </span>
              {totalDonations > 0 && (
                <div className={styles.totalDonationsBox}>
                  <span className={styles.totalLabel}>Raised</span>
                  <span className={styles.totalValue}>
                    ${totalDonations.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        className="container"
        style={{ padding: "2rem 1.5rem", position: "relative", zIndex: 2 }}
      >
        {project.description && (
          <div className={`${styles.descriptionCard} card`}>
            <p>{project.description}</p>
          </div>
        )}

        {/* Live Toast Alert Banner */}
        {latestAlert && (
          <div
            className={`${styles.alertToast} animate-slide-in-up`}
            style={{ borderLeftColor: themeColor }}
          >
            <span className={styles.toastIcon}>
              {getEventIcon(latestAlert.type)}
            </span>
            <div className={styles.toastBody}>
              <div className={styles.toastTitle}>
                NEW {latestAlert.type.toUpperCase()}!
              </div>
              <p className={styles.toastContent}>
                <strong>{latestAlert.sender_name || "Anonymous"}</strong>:{" "}
                {latestAlert.content}
                {latestAlert.amount && ` ($${latestAlert.amount.toFixed(2)})`}
              </p>
            </div>
          </div>
        )}

        {/* Real-time Activity Feed */}
        <section className={styles.feedSection}>
          <h2 className={styles.feedTitle}>Activity Stream</h2>

          {events.length === 0 ? (
            <div className={`${styles.emptyCard} card`}>
              <Radio size={24} strokeWidth={1.8} aria-hidden="true" />
              <h3>Waiting for live activity...</h3>
              <p>
                When the host broadcasts events, they will appear here in real
                time.
              </p>
            </div>
          ) : (
            <div className={styles.eventsGrid}>
              {events.map((ev, index) => (
                <div
                  key={ev.id}
                  className={`${styles.eventCard} card ${index === 0 ? styles.newestEvent : ""}`}
                >
                  <div className={styles.eventHeader}>
                    <span className={styles.eventIcon}>
                      {getEventIcon(ev.type)}
                    </span>
                    <div className={styles.eventSenderGroup}>
                      <span className={styles.senderName}>
                        {ev.sender_name || "Anonymous"}
                      </span>
                      <span className={`badge ${getBadgeStyle(ev.type)}`}>
                        {ev.type}
                      </span>
                    </div>
                    {ev.amount && (
                      <span className={styles.amountTag}>
                        +${ev.amount.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <p className={styles.eventText}>{ev.content}</p>

                  <div className={styles.eventFooter}>
                    <span className={styles.timeTag}>
                      {formatTime(ev.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function getEventIcon(type: string) {
  const icons: Record<string, LucideIcon> = {
    donation: Heart,
    message: MessageSquareText,
    alert: Bell,
    follow: Star,
    milestone: Trophy,
  };
  const Icon = icons[type] ?? Pin;
  return <Icon size={18} strokeWidth={1.8} aria-hidden="true" />;
}

function getBadgeStyle(type: string) {
  switch (type) {
    case "donation":
      return "badge-purple";
    case "message":
      return "badge-cyan";
    case "alert":
      return "badge-amber";
    case "follow":
      return "badge-green";
    case "milestone":
      return "badge-red";
    default:
      return "badge-purple";
  }
}

function formatTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
