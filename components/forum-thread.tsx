"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatMessage } from "@/components/chat-message";
import { ForumReplyForm } from "@/components/forum-reply-form";

export type ForumPostItem = {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorAvatarKey: string | null;
  authorAvatarColor: string | null;
};

export function ForumThread({
  topicId,
  posts,
  currentUserId,
  locked,
}: {
  topicId: string;
  posts: ForumPostItem[];
  currentUserId: string | null;
  locked: boolean;
}) {
  const router = useRouter();
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const byParent = useMemo(() => {
    const map = new Map<string | null, ForumPostItem[]>();
    for (const post of posts) {
      const key = post.parentId ?? null;
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
    return map;
  }, [posts]);

  async function editPost(id: string, body: string) {
    const res = await fetch(`/api/forum/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) router.refresh();
  }

  function render(post: ForumPostItem, depth: number) {
    const children = byParent.get(post.id) ?? [];
    return (
      <div
        key={post.id}
        className={depth === 0 ? "" : "ml-4"}
      >
        <ChatMessage
          item={{
            id: post.id,
            body: post.body,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
            author: {
              id: post.authorId,
              name: post.authorName,
              role: post.authorRole,
              avatarKey: post.authorAvatarKey,
              avatarColor: post.authorAvatarColor,
            },
          }}
          currentUserId={currentUserId}
          onReply={currentUserId && !locked ? () => setReplyTo(post.id) : undefined}
          onEdit={currentUserId === post.authorId ? (body) => editPost(post.id, body) : undefined}
        />
        {replyTo === post.id && currentUserId && !locked && (
          <ForumReplyForm topicId={topicId} parentId={post.id} compact onDone={() => setReplyTo(null)} />
        )}
        {children.map((child) => (
          <div key={child.id} className="mt-3">
            {render(child, depth + 1)}
          </div>
        ))}
      </div>
    );
  }

  const roots = byParent.get(null) ?? [];
  if (roots.length === 0) {
    return <p className="text-sm text-muted">Пока тихо — можно ответить первым.</p>;
  }

  return <div className="space-y-3">{roots.map((post) => render(post, 0))}</div>;
}
