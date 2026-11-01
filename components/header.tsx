import { unreadForumCount } from "@/lib/db/forum";
import { getFeatureFlags } from "@/lib/features";
import { featureAvailability } from "@/lib/feature-flags";
import Link from "next/link";
import { AntoineMark } from "@/components/antoine-mark";
import { HomeLogoLink } from "@/components/home-logo-link";
import { getCurrentUser } from "@/lib/auth";
import { HeaderAccount } from "@/components/header-account";
import { HeaderMoreNav } from "@/components/header-more-nav";
import { MobileMenu } from "@/components/mobile-menu";
import { SubscriptionNotice } from "@/components/subscription-notice";
import { ThemeToggle } from "@/components/theme-toggle";
import { getEntitlements } from "@/lib/db/billing";
import { getTotalUnreadCount } from "@/lib/db/messages";
import { getIncomingFriendRequestCount } from "@/lib/db/friends";

export async function Header() {
  const user = await getCurrentUser();
  const forumUnread = await unreadForumCount(user);
  const allowed = featureAvailability(getFeatureFlags(), user);
  const [unreadMessages, incomingFriendRequests, entitlements] = user
    ? await Promise.all([
        getTotalUnreadCount(user.id),
        getIncomingFriendRequestCount(user.id),
        getEntitlements(user),
      ])
    : [0, 0, null];

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper">
      <SubscriptionNotice entitlements={entitlements} />
      <div className="shell flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
        <HomeLogoLink className="flex items-center gap-2.5">
          <AntoineMark className="size-8 shrink-0" />
          <span className="font-serif text-[1.25rem] italic leading-none tracking-tight">blablablarden</span>
        </HomeLogoLink>

        <nav className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] sm:gap-x-4">
          <Link
            href="/#catalog"
            className="hidden text-muted transition-colors hover:text-rust sm:block"
          >
            Каталог
          </Link>
          {allowed.rooms && (<Link
            href="/seminars"
            className="hidden text-muted transition-colors hover:text-rust sm:block"
          >
            Чтения
          </Link>)}
          {allowed.forum && (<Link
            href="/discuss"
            className="hidden text-muted transition-colors hover:text-rust sm:block"
          >
            Обсуждения{forumUnread > 0 && <span className="ml-1 text-xs text-rust" aria-label={`Новых ответов: ${forumUnread}`}>{forumUnread > 99 ? "99+" : forumUnread}</span>}
          </Link>)}
          {allowed.feed && (<Link href="/news" className="hidden text-muted transition-colors hover:text-rust md:block">
            Новости
          </Link>)}
          {allowed.channels && (<Link href="/channels" className="hidden text-muted transition-colors hover:text-rust md:block">
            Каналы
          </Link>)}
          {user && (
            <Link href="/library" className="hidden text-muted transition-colors hover:text-rust md:block">
              Полка
            </Link>
          )}
          {entitlements?.source !== "subscription" && (
            <Link href="/pricing" className="hidden font-medium text-rust transition-colors hover:text-ink md:block">
              Билет
            </Link>
          )}
          <HeaderMoreNav
            isLoggedIn={Boolean(user)}
            hasTicket={entitlements?.source === "subscription"}
            ticketLabel={entitlements?.source === "subscription" ? entitlements.planName : "Читательский билет"}
          />
          <ThemeToggle className="hidden sm:grid" />
          <HeaderAccount user={user} unreadMessages={unreadMessages} />
          <MobileMenu
            allowed={allowed}
            forumUnread={forumUnread}
            isAdmin={user?.role === "admin"}
            isLoggedIn={Boolean(user)}
            needsTicket={entitlements?.source !== "subscription"}
            incomingFriendRequests={incomingFriendRequests}
          />
        </nav>
      </div>
    </header>
  );
}
