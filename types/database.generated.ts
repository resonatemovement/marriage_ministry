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
    PostgrestVersion: "14.5"
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
      campus_lead_assignments: {
        Row: {
          assigned_by: string | null
          campus_id: string
          created_at: string
          ended_at: string | null
          id: string
          profile_id: string
          started_at: string
        }
        Insert: {
          assigned_by?: string | null
          campus_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          profile_id: string
          started_at?: string
        }
        Update: {
          assigned_by?: string | null
          campus_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          profile_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_lead_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_lead_assignments_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_lead_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_lead_coach_assignments: {
        Row: {
          assigned_by: string
          campus_lead_group_id: string
          coach_group_id: string
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
        }
        Insert: {
          assigned_by: string
          campus_lead_group_id: string
          coach_group_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Update: {
          assigned_by?: string
          campus_lead_group_id?: string
          coach_group_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_lead_coach_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_lead_coach_assignments_campus_lead_group_id_fkey"
            columns: ["campus_lead_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_lead_coach_assignments_coach_group_id_fkey"
            columns: ["coach_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_lead_counselor_assignments: {
        Row: {
          assigned_by: string
          campus_lead_group_id: string
          counselor_group_id: string
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
        }
        Insert: {
          assigned_by: string
          campus_lead_group_id: string
          counselor_group_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Update: {
          assigned_by?: string
          campus_lead_group_id?: string
          counselor_group_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_lead_counselor_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_lead_counselor_assignments_campus_lead_group_id_fkey"
            columns: ["campus_lead_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_lead_counselor_assignments_counselor_group_id_fkey"
            columns: ["counselor_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
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
          assigned_group_id: string | null
          assigned_profile_id: string | null
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
          assigned_group_id?: string | null
          assigned_profile_id?: string | null
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
          assigned_group_id?: string | null
          assigned_profile_id?: string | null
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
            foreignKeyName: "case_assignments_assigned_profile_id_fkey"
            columns: ["assigned_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      intake_request_people: {
        Row: {
          city: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          intake_request_id: string
          last_name: string
          person_position: Database["public"]["Enums"]["intake_request_person_position"]
          phone: string
          resonate_connections: Json
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          intake_request_id: string
          last_name: string
          person_position: Database["public"]["Enums"]["intake_request_person_position"]
          phone: string
          resonate_connections?: Json
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          intake_request_id?: string
          last_name?: string
          person_position?: Database["public"]["Enums"]["intake_request_person_position"]
          phone?: string
          resonate_connections?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_request_people_intake_request_id_fkey"
            columns: ["intake_request_id"]
            isOneToOne: false
            referencedRelation: "intake_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_request_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status:
            | Database["public"]["Enums"]["intake_request_status"]
            | null
          id: number
          intake_request_id: string
          note: string | null
          reason_code: string | null
          reason_detail: string | null
          to_status: Database["public"]["Enums"]["intake_request_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?:
            | Database["public"]["Enums"]["intake_request_status"]
            | null
          id?: never
          intake_request_id: string
          note?: string | null
          reason_code?: string | null
          reason_detail?: string | null
          to_status: Database["public"]["Enums"]["intake_request_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?:
            | Database["public"]["Enums"]["intake_request_status"]
            | null
          id?: never
          intake_request_id?: string
          note?: string | null
          reason_code?: string | null
          reason_detail?: string | null
          to_status?: Database["public"]["Enums"]["intake_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "intake_request_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_request_status_history_intake_request_id_fkey"
            columns: ["intake_request_id"]
            isOneToOne: false
            referencedRelation: "intake_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_requests: {
        Row: {
          campus_id: string | null
          campus_other: string | null
          created_at: string
          currently_working_with_counselor: boolean
          goals: string
          id: string
          invited_group_id: string | null
          questions: string | null
          referral_source: string
          referral_source_other: string | null
          relationship_status: Database["public"]["Enums"]["intake_relationship_status"]
          requested_support: string[]
          status: Database["public"]["Enums"]["intake_request_status"]
          submitted_at: string
          updated_at: string
          wedding_date: string | null
        }
        Insert: {
          campus_id?: string | null
          campus_other?: string | null
          created_at?: string
          currently_working_with_counselor: boolean
          goals: string
          id?: string
          invited_group_id?: string | null
          questions?: string | null
          referral_source: string
          referral_source_other?: string | null
          relationship_status: Database["public"]["Enums"]["intake_relationship_status"]
          requested_support: string[]
          status?: Database["public"]["Enums"]["intake_request_status"]
          submitted_at?: string
          updated_at?: string
          wedding_date?: string | null
        }
        Update: {
          campus_id?: string | null
          campus_other?: string | null
          created_at?: string
          currently_working_with_counselor?: boolean
          goals?: string
          id?: string
          invited_group_id?: string | null
          questions?: string | null
          referral_source?: string
          referral_source_other?: string | null
          relationship_status?: Database["public"]["Enums"]["intake_relationship_status"]
          requested_support?: string[]
          status?: Database["public"]["Enums"]["intake_request_status"]
          submitted_at?: string
          updated_at?: string
          wedding_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_requests_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_requests_invited_group_id_fkey"
            columns: ["invited_group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          auth_user_id: string | null
          campus_id: string
          created_at: string
          delivery_attempt_count: number
          delivery_error_category: string | null
          email: string
          expires_at: string | null
          first_name: string
          group_id: string | null
          id: string
          intended_role: Database["public"]["Enums"]["app_role"]
          invited_by: string
          last_delivery_attempt_at: string | null
          last_delivery_succeeded_at: string | null
          last_name: string
          last_sent_at: string | null
          phone: string | null
          resend_count: number
          revoked_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id?: string | null
          campus_id: string
          created_at?: string
          delivery_attempt_count?: number
          delivery_error_category?: string | null
          email: string
          expires_at?: string | null
          first_name?: string
          group_id?: string | null
          id?: string
          intended_role: Database["public"]["Enums"]["app_role"]
          invited_by: string
          last_delivery_attempt_at?: string | null
          last_delivery_succeeded_at?: string | null
          last_name?: string
          last_sent_at?: string | null
          phone?: string | null
          resend_count?: number
          revoked_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string | null
          campus_id?: string
          created_at?: string
          delivery_attempt_count?: number
          delivery_error_category?: string | null
          email?: string
          expires_at?: string | null
          first_name?: string
          group_id?: string | null
          id?: string
          intended_role?: Database["public"]["Enums"]["app_role"]
          invited_by?: string
          last_delivery_attempt_at?: string | null
          last_delivery_succeeded_at?: string | null
          last_name?: string
          last_sent_at?: string | null
          phone?: string | null
          resend_count?: number
          revoked_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          channel: string
          created_at: string
          error_category: string | null
          error_message: string | null
          event_type: string
          failed_at: string | null
          id: string
          provider_message_id: string | null
          recipient_email: string
          recipient_profile_id: string | null
          related_entity_id: string
          related_entity_type: string
          sent_at: string | null
          status: string
          template_key: string
        }
        Insert: {
          channel: string
          created_at?: string
          error_category?: string | null
          error_message?: string | null
          event_type: string
          failed_at?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email: string
          recipient_profile_id?: string | null
          related_entity_id: string
          related_entity_type: string
          sent_at?: string | null
          status?: string
          template_key: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_category?: string | null
          error_message?: string | null
          event_type?: string
          failed_at?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email?: string
          recipient_profile_id?: string | null
          related_entity_id?: string
          related_entity_type?: string
          sent_at?: string | null
          status?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_photo_handoffs: {
        Row: {
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          profile_id: string
          token_hash: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          profile_id: string
          token_hash: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          profile_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_photo_handoffs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          onboarding_completed_at: string | null
          phone: string | null
          photo_path: string | null
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
          onboarding_completed_at?: string | null
          phone?: string | null
          photo_path?: string | null
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
          onboarding_completed_at?: string | null
          phone?: string | null
          photo_path?: string | null
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
      session_material_blocks: {
        Row: {
          block_type: string
          created_at: string
          description: string | null
          id: string
          position: number
          rich_text_content: Json | null
          session_id: string
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          block_type: string
          created_at?: string
          description?: string | null
          id?: string
          position: number
          rich_text_content?: Json | null
          session_id: string
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          block_type?: string
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          rich_text_content?: Json | null
          session_id?: string
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_material_blocks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          published_at: string | null
          sequence_number: number
          status: Database["public"]["Enums"]["session_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          published_at?: string | null
          sequence_number?: never
          status?: Database["public"]["Enums"]["session_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          published_at?: string | null
          sequence_number?: never
          status?: Database["public"]["Enums"]["session_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      system_heartbeat: {
        Row: {
          last_seen_at: string
          name: string
        }
        Insert: {
          last_seen_at?: string
          name: string
        }
        Update: {
          last_seen_at?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: never; Returns: Json }
      activate_invitation_account: { Args: never; Returns: Json }
      admin_assert_incomplete_profile: {
        Args: { target_profile_id: string }
        Returns: undefined
      }
      admin_complete_onboarding: {
        Args: { target_profile_id: string }
        Returns: undefined
      }
      admin_set_profile_photo: {
        Args: { target_profile_id: string }
        Returns: undefined
      }
      admin_update_incomplete_profile: {
        Args: {
          target_campus_id: string
          target_first_name: string
          target_last_name: string
          target_phone: string
          target_profile_id: string
        }
        Returns: undefined
      }
      assign_campus_lead_coach: {
        Args: {
          target_campus_lead_group_id: string
          target_coach_group_id: string
        }
        Returns: string
      }
      assign_campus_lead_counselor: {
        Args: {
          target_campus_lead_group_id: string
          target_counselor_group_id: string
        }
        Returns: string
      }
      assign_counseling_case: {
        Args: {
          reassignment_reason?: string
          target_assignment_type: Database["public"]["Enums"]["case_assignment_type"]
          target_case_id: string
          target_group_id: string
        }
        Returns: string
      }
      assign_counseling_case_as_campus_lead: {
        Args: {
          reassignment_reason?: string
          target_assignment_type: Database["public"]["Enums"]["case_assignment_type"]
          target_case_id: string
          target_group_id: string
        }
        Returns: string
      }
      assign_counseling_case_to_campus_lead: {
        Args: {
          reassignment_reason?: string
          target_case_id: string
          target_profile_id: string
        }
        Returns: string
      }
      assign_counselor_coach_supervision: {
        Args: {
          target_coach_group_id: string
          target_counselor_group_id: string
        }
        Returns: string
      }
      cleanup_intake_permanent_delete_verifier_artifacts: {
        Args: { target_group_ids: string[] }
        Returns: Json
      }
      cleanup_people_lifecycle_verifier_artifacts: {
        Args: never
        Returns: Json
      }
      cleanup_verifier_relationship_artifacts: { Args: never; Returns: Json }
      complete_onboarding: { Args: never; Returns: undefined }
      complete_profile_photo_handoff: {
        Args: { target_token_hash: string }
        Returns: undefined
      }
      create_intake_request: { Args: { payload: Json }; Returns: string }
      create_intake_request_with_city_optional: {
        Args: { payload: Json }
        Returns: string
      }
      create_intake_request_with_required_city: {
        Args: { payload: Json }
        Returns: string
      }
      create_invitations: { Args: { payload: Json }; Returns: Json }
      create_profile_photo_handoff: { Args: never; Returns: Json }
      delete_disposable_intake_graph: {
        Args: { target_intake_id: string }
        Returns: Json
      }
      delete_disposable_team_graph: {
        Args: { target_group_id: string }
        Returns: Json
      }
      delete_intake_request: {
        Args: { target_request_id: string }
        Returns: Json
      }
      delete_session_material_block: {
        Args: { target_block_id: string }
        Returns: undefined
      }
      duplicate_session_material_block: {
        Args: { target_block_id: string }
        Returns: string
      }
      ensure_and_assign_counseling_case: {
        Args: {
          reassignment_reason?: string
          target_assignment_type: Database["public"]["Enums"]["case_assignment_type"]
          target_couple_group_id: string
          target_group_id: string
          target_profile_id: string
        }
        Returns: string
      }
      enter_onboarding: { Args: never; Returns: undefined }
      invite_intake_request: {
        Args: { target_request_id: string }
        Returns: Json
      }
      record_invitation_auth_identity: {
        Args: { target_auth_user_id: string; target_invitation_id: string }
        Returns: undefined
      }
      record_invitation_auth_reset: {
        Args: { target_invitation_id: string }
        Returns: undefined
      }
      record_invitation_delivery: {
        Args: {
          failure_category?: string
          succeeded: boolean
          target_auth_user_id: string
          target_invitation_id: string
        }
        Returns: undefined
      }
      record_invitation_resend: {
        Args: { target_invitation_id: string }
        Returns: undefined
      }
      record_invitation_setup_resend: {
        Args: { target_invitation_id: string }
        Returns: undefined
      }
      record_onboarding_photo: { Args: never; Returns: undefined }
      reorder_session_material_blocks: {
        Args: { target_block_ids: string[]; target_session_id: string }
        Returns: undefined
      }
      save_onboarding_profile: {
        Args: {
          target_first_name: string
          target_last_name: string
          target_phone: string
        }
        Returns: Json
      }
      take_intake_request_action: {
        Args: {
          target_action: string
          target_reason_code?: string
          target_reason_detail?: string
          target_request_id: string
        }
        Returns: undefined
      }
      unassign_campus_lead_coach: {
        Args: {
          target_campus_lead_group_id: string
          target_coach_group_id: string
        }
        Returns: boolean
      }
      unassign_campus_lead_counselor: {
        Args: {
          target_campus_lead_group_id: string
          target_counselor_group_id: string
        }
        Returns: boolean
      }
      unassign_counseling_case: {
        Args: { target_couple_group_id: string; unassignment_reason?: string }
        Returns: boolean
      }
      unassign_counselor_coach_supervision: {
        Args: { target_counselor_group_id: string }
        Returns: boolean
      }
      update_intake_request_status: {
        Args: {
          next_status: Database["public"]["Enums"]["intake_request_status"]
          target_request_id: string
        }
        Returns: undefined
      }
      update_own_profile: {
        Args: {
          target_first_name: string
          target_last_name: string
          target_phone: string
          target_photo_path?: string
        }
        Returns: undefined
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
        | "campus_lead"
      case_assignment_type: "coach" | "counselor" | "campus_lead"
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
      group_type:
        | "couple"
        | "coach_team"
        | "counselor_team"
        | "campus_lead_team"
      intake_relationship_status: "pre_engaged" | "engaged" | "married"
      intake_request_person_position: "requester" | "partner"
      intake_request_status:
        | "ready_for_review"
        | "under_review"
        | "ready_to_invite"
        | "invited"
        | "closed"
      invitation_status: "pending" | "accepted" | "expired" | "revoked"
      profile_status:
        | "invited"
        | "active"
        | "deactivated"
        | "password_required"
        | "onboarding"
      session_status: "draft" | "published" | "archived"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "campus_lead",
      ],
      case_assignment_type: ["coach", "counselor", "campus_lead"],
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
      group_type: [
        "couple",
        "coach_team",
        "counselor_team",
        "campus_lead_team",
      ],
      intake_relationship_status: ["pre_engaged", "engaged", "married"],
      intake_request_person_position: ["requester", "partner"],
      intake_request_status: [
        "ready_for_review",
        "under_review",
        "ready_to_invite",
        "invited",
        "closed",
      ],
      invitation_status: ["pending", "accepted", "expired", "revoked"],
      profile_status: [
        "invited",
        "active",
        "deactivated",
        "password_required",
        "onboarding",
      ],
      session_status: ["draft", "published", "archived"],
    },
  },
} as const
