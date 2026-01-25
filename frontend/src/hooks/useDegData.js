import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export function useDegData() {
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [degData, setDegData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch groups on mount
    useEffect(() => {
        let ignore = false;
        async function fetchGroups() {
            try {
                const response = await fetch(`${API_BASE}/api/dataset/deg?groups_only=true`);
                if (!response.ok) throw new Error("Failed to fetch DEG groups");
                const data = await response.json();
                if (!ignore) {
                    setGroups(data.groups || []);
                }
            } catch (err) {
                if (!ignore) setError(err.message);
            }
        }
        fetchGroups();
        return () => { ignore = true; };
    }, []);

    // Fetch DEG data when selectedGroup changes
    useEffect(() => {
        if (!selectedGroup) return;

        let ignore = false;
        setLoading(true);
        async function fetchData() {
            try {
                // Encode group name to handle spaces/special chars
                const encoded = encodeURIComponent(selectedGroup);
                const response = await fetch(`${API_BASE}/api/dataset/deg?group=${encoded}`);
                if (!response.ok) throw new Error("Failed to fetch DEG data");
                const data = await response.json();
                if (!ignore) {
                    setDegData(data);
                }
            } catch (err) {
                if (!ignore) setError(err.message);
            } finally {
                if (!ignore) setLoading(false);
            }
        }
        fetchData();
        return () => { ignore = true; };
    }, [selectedGroup]);

    return {
        groups,
        selectedGroup,
        setSelectedGroup,
        degData,
        loading,
        error,
    };
}
