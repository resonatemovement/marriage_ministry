export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      assessment_documents: {
        Row: {
          content_type: string
          counseling_case_id: string
          created_at: string
          file_name: string
          id: string
          object_path: string
          profile_id: string | null
          size_bytes: number
          uploaded_by: string
        }
        Insert: {
          content_type: string
          counseling_case_id: string
          created_at?: string
          file_name: string
          id?: string
          object_path: string
          profile_id?: string | null
          size_bytes: number
          uploaded_by: string
        }
        Update: {
          content_type?: string
          counseling_case_id?: string
          created_at?: string
          file_name?: string
          id?: string
          object_path?: string
          profile_id?: string | null
          size_bytes?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_documents_counseling_case_id_fkey"
            columns: ["counseling_case_id"]
            isOneToOne: false
            referencedRelation: "counseling_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_id: string | null
          details: Json
          entity_id: string
          entity_type: string
          event_type: string
          id: number
          occurred_at: string
        }
        Insert: {
          actor_id?: string | null
          details?: Json
          entity_id: string
          entity_type: string
          event_type: string
          id?: never
          occurred_at?: string
        }
        Update: {
          actor_id?: string | null
          details?: Json
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: never
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      case_assignments: {
        Row: {
          assigned_by: string
          assigned_group_id: string
          assignment_type: Database["public"]["Enums"]["case_assignment_type"]
          counseling_case_id: string
          created_at: string
          end_reason: string | null
          ended_at: string | null
          id: string
          started_at: string
        }
        Insert: {
          assigned_by: string
          assigned_group_id: string
          assignment_type: Database["public"]["Enums"]["case_assignment_type"]
          counseling_case_id: string
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Update: {
          assigned_by?: string
          assigned_group_id?: string
          assignment_type?: Database["public"]["Enums"]["case_assignment_type"]
          counseling_case_id?: string
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_assignments_assigned_group_id_fkey"
            columns: ["assigned_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_assignments_counseling_case_id_fkey"
            columns: ["counseling_case_id"]
            isOneToOne: false
            referencedRelation: "counseling_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          counseling_case_id: string
          from_status: Database["public"]["Enums"]["case_status"] | null
          id: number
          reason: string | null
          to_status: Database["public"]["Enums"]["case_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          counseling_case_id: string
          from_status?: Database["public"]["Enums"]["case_status"] | null
          id?: never
          reason?: string | null
          to_status: Database["public"]["Enums"]["case_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          counseling_case_id?: string
          from_status?: Database["public"]["Enums"]["case_status"] | null
          id?: never
          reason?: string | null
          to_status?: Database["public"]["Enums"]["case_status"]
        }
        Relationships: [
          {
            foreignKeyName: "case_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_status_history_counseling_case_id_fkey"
            columns: ["counseling_case_id"]
            isOneToOne: false
            referencedRelation: "counseling_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      counseling_cases: {
        Row: {
          campus_id: string | null
          closed_at: string | null
          couple_group_id: string
          created_at: string
          created_by: string | null
          id: string
          requested_at: string
          status: Database["public"]["Enums"]["case_status"]
          updated_at: string
        }
        Insert: {
          campus_id?: string | null
          closed_at?: string | null
          couple_group_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["case_status"]
          updated_at?: string
        }
        Update: {
          campus_id?: string | null
          closed_at?: string | null
          couple_group_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["case_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "counseling_cases_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counseling_cases_couple_group_id_fkey"
            columns: ["couple_group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counseling_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          ended_at: string | null
          group_id: string
          id: string
          joined_at: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          group_id: string
          id?: string
          joined_at?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          group_id?: string
          id?: string
          joined_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          active: boolean
          campus_id: string | null
          created_at: string
          group_type: Database["public"]["Enums"]["group_type"]
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          campus_id?: string | null
          created_at?: string
          group_type: Database["public"]["Enums"]["group_type"]
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          campus_id?: string | null
          created_at?: string
          group_type?: Database["public"]["Enums"]["group_type"]
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profile_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          campus_id: string | null
          created_at: string
          deactivated_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string | null
          first_name?: string
          id: string
          last_name?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      supervision_assignments: {
        Row: {
          assigned_by: string
          coach_group_id: string
          counselor_group_id: string
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
        }
        Insert: {
          assigned_by: string
          coach_group_id: string
          counselor_group_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Update: {
          assigned_by?: string
          coach_group_id?: string
          counselor_group_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervision_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervision_assignments_coach_group_id_fkey"
            columns: ["coach_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervision_assignments_counselor_group_id_fkey"
            columns: ["counselor_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_counseling_case: {
        Args: {
          reassignment_reason?: string
          target_assignment_type: Database["public"]["Enums"]["case_assignment_type"]
          target_case_id: string
          target_group_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "coach"
        | "counselor"
        | "couple"
        | "author"
      case_assignment_type: "coach" | "counselor"
      case_status:
        | "requested"
        | "assessment"
        | "interviewed"
        | "matched"
        | "active"
        | "pending_final"
        | "finished"
        | "referred"
        | "inactive"
      group_type: "couple" | "coach_team" | "counselor_team"
      profile_status: "invited" | "active" | "deactivated"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "admin",
        "coach",
        "counselor",
        "couple",
        "author",
      ],
      case_assignment_type: ["coach", "counselor"],
      case_status: [
        "requested",
        "assessment",
        "interviewed",
        "matched",
        "active",
        "pending_final",
        "finished",
        "referred",
        "inactive",
      ],
      group_type: ["couple", "coach_team", "counselor_team"],
      profile_status: ["invited", "active", "deactivated"],
    },
  },
} as const
