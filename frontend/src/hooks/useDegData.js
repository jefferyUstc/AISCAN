import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client.js";

const EMPTY_ARRAY = [];

export function useDegData() {
  const [selectedGroup, setSelectedGroup] = useState(null);

  const groupsQuery = useQuery({
    queryKey: ["deg", "groups"],
    queryFn: () => apiGet("/api/dataset/deg", { groups_only: true }),
  });

  const degQuery = useQuery({
    queryKey: ["deg", "data", selectedGroup],
    queryFn: () => apiGet("/api/dataset/deg", { group: selectedGroup }),
    enabled: Boolean(selectedGroup),
  });

  return {
    groups: groupsQuery.data?.groups ?? EMPTY_ARRAY,
    selectedGroup,
    setSelectedGroup,
    degData: degQuery.data ?? null,
    loading: degQuery.isFetching,
    error: (groupsQuery.error || degQuery.error)?.message || null,
  };
}
