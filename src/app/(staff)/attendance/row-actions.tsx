"use client";

import { LogOut, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { api, errorMessage } from "@/lib/api";

export function RowActions({ id, name, canCheckOut, canDelete }: { id: string; name: string; canCheckOut: boolean; canDelete: boolean }) {
  const router = useRouter();
  if (!canCheckOut && !canDelete) return null;
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Actions for ${name}'s check-in`}>
          <MoreHorizontal />
        </Button>
      }
    >
      {canCheckOut && (
        <MenuItem onSelect={() => void act(() => api(`/attendance/${id}/check-out`, { method: "POST" }), `${name} checked out`)}>
          <LogOut /> Check out
        </MenuItem>
      )}
      {canDelete && (
        <MenuItem danger onSelect={() => void act(() => api(`/attendance/${id}`, { method: "DELETE" }), "Check-in removed")}>
          <Trash2 /> Remove (recorded by mistake)
        </MenuItem>
      )}
    </Menu>
  );
}
