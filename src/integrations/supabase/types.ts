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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json | null
          created_at: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          project_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          project_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ata_approval_tokens: {
        Row: {
          created_at: string | null
          created_by_user_id: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          expires_at: string | null
          id: string
          project_id: string
          response: string | null
          task_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by_user_id: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          expires_at?: string | null
          id?: string
          project_id: string
          response?: string | null
          task_id: string
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by_user_id?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          expires_at?: string | null
          id?: string
          project_id?: string
          response?: string | null
          task_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ata_approval_tokens_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ata_approval_tokens_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ata_approval_tokens_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ata_approval_tokens_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          check_in: string
          check_out: string | null
          created_at: string
          duration_minutes: number | null
          id: string
          notes: string | null
          project_id: string
          worker_name: string
          worker_personnummer: string | null
          worker_phone: string | null
          worker_user_id: string | null
        }
        Insert: {
          check_in?: string
          check_out?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          project_id: string
          worker_name: string
          worker_personnummer?: string | null
          worker_phone?: string | null
          worker_user_id?: string | null
        }
        Update: {
          check_in?: string
          check_out?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          project_id?: string
          worker_name?: string
          worker_personnummer?: string | null
          worker_phone?: string | null
          worker_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_worker_user_id_fkey"
            columns: ["worker_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_worker_user_id_fkey"
            columns: ["worker_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          owner_id: string
          phone: string | null
          postal_code: string | null
          reference: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          owner_id: string
          phone?: string | null
          postal_code?: string | null
          reference?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          owner_id?: string
          phone?: string | null
          postal_code?: string | null
          reference?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_mentions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          mentioned_user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          mentioned_user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          mentioned_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reactions: {
        Row: {
          comment_id: string
          created_at: string | null
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          emoji?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_display_name: string | null
          content: string
          created_at: string
          created_by_user_id: string
          drawing_object_id: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          images: Json | null
          is_resolved: boolean | null
          material_id: string | null
          parent_comment_id: string | null
          project_id: string | null
          task_id: string | null
          updated_at: string
        }
        Insert: {
          author_display_name?: string | null
          content: string
          created_at?: string
          created_by_user_id: string
          drawing_object_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          images?: Json | null
          is_resolved?: boolean | null
          material_id?: string | null
          parent_comment_id?: string | null
          project_id?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          author_display_name?: string | null
          content?: string
          created_at?: string
          created_by_user_id?: string
          drawing_object_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          images?: Json | null
          is_resolved?: boolean | null
          material_id?: string | null
          parent_comment_id?: string | null
          project_id?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_drawing_object_id_fkey"
            columns: ["drawing_object_id"]
            isOneToOne: false
            referencedRelation: "floor_map_shapes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          category: string | null
          company: string | null
          created_at: string
          created_by_user_id: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          company?: string | null
          created_at?: string
          created_by_user_id: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          company?: string | null
          created_at?: string
          created_by_user_id?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractors_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_intake_requests: {
        Row: {
          attachments: Json | null
          client_id: string | null
          created_at: string | null
          creator_id: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          desired_start_date: string | null
          expires_at: string | null
          greeting: string | null
          id: string
          images: Json | null
          project_description: string | null
          project_id: string | null
          property_address: string | null
          property_city: string | null
          property_postal_code: string | null
          property_type: string | null
          rooms_data: Json | null
          status: string
          submitted_at: string | null
          token: string
          updated_at: string | null
        }
        Insert: {
          attachments?: Json | null
          client_id?: string | null
          created_at?: string | null
          creator_id: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          desired_start_date?: string | null
          expires_at?: string | null
          greeting?: string | null
          id?: string
          images?: Json | null
          project_description?: string | null
          project_id?: string | null
          property_address?: string | null
          property_city?: string | null
          property_postal_code?: string | null
          property_type?: string | null
          rooms_data?: Json | null
          status?: string
          submitted_at?: string | null
          token?: string
          updated_at?: string | null
        }
        Update: {
          attachments?: Json | null
          client_id?: string | null
          created_at?: string | null
          creator_id?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          desired_start_date?: string | null
          expires_at?: string | null
          greeting?: string | null
          id?: string
          images?: Json | null
          project_description?: string | null
          project_id?: string | null
          property_address?: string | null
          property_city?: string | null
          property_postal_code?: string | null
          property_type?: string | null
          rooms_data?: Json | null
          status?: string
          submitted_at?: string | null
          token?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_intake_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_intake_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_intake_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_intake_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string
          from_user_id: string
          id: string
          images: Json | null
          is_read: boolean
          project_id: string
          read_at: string | null
          to_user_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          from_user_id: string
          id?: string
          images?: Json | null
          is_read?: boolean
          project_id: string
          read_at?: string | null
          to_user_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          from_user_id?: string
          id?: string
          images?: Json | null
          is_read?: boolean
          project_id?: string
          read_at?: string | null
          to_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_quote_assignments: {
        Row: {
          allocated_amount: number
          created_at: string
          external_quote_id: string
          id: string
          task_id: string
        }
        Insert: {
          allocated_amount?: number
          created_at?: string
          external_quote_id: string
          id?: string
          task_id: string
        }
        Update: {
          allocated_amount?: number
          created_at?: string
          external_quote_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_quote_assignments_external_quote_id_fkey"
            columns: ["external_quote_id"]
            isOneToOne: false
            referencedRelation: "external_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_quote_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      external_quotes: {
        Row: {
          builder_name: string
          color: string
          created_at: string
          file_name: string | null
          file_path: string | null
          id: string
          notes: string | null
          project_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          builder_name?: string
          color?: string
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          project_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          builder_name?: string
          color?: string
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_map_plans: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          project_id: string
          updated_at: string
          view_settings: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          project_id: string
          updated_at?: string
          view_settings?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          project_id?: string
          updated_at?: string
          view_settings?: Json
        }
        Relationships: []
      }
      floor_map_shapes: {
        Row: {
          color: string | null
          created_at: string
          id: string
          plan_id: string | null
          project_id: string
          properties: Json | null
          room_id: string | null
          shape_data: Json
          shape_type: string
          stroke_color: string | null
          updated_at: string
          view_mode: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          plan_id?: string | null
          project_id: string
          properties?: Json | null
          room_id?: string | null
          shape_data: Json
          shape_type: string
          stroke_color?: string | null
          updated_at?: string
          view_mode?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          plan_id?: string | null
          project_id?: string
          properties?: Json | null
          room_id?: string | null
          shape_data?: Json
          shape_type?: string
          stroke_color?: string | null
          updated_at?: string
          view_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "floor_map_shapes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "floor_map_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_map_shapes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_map_shapes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      help_bot_cache: {
        Row: {
          cache_key: string
          created_at: string | null
          id: string
          language: string
          response: string
          user_type: string | null
        }
        Insert: {
          cache_key: string
          created_at?: string | null
          id?: string
          language: string
          response: string
          user_type?: string | null
        }
        Update: {
          cache_key?: string
          created_at?: string | null
          id?: string
          language?: string
          response?: string
          user_type?: string | null
        }
        Relationships: []
      }
      inspection_templates: {
        Row: {
          category: string
          created_at: string
          id: string
          items: Json
          name: string
          profile_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          items?: Json
          name: string
          profile_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          items?: Json
          name?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_templates_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_templates_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          approved_at: string | null
          approved_by_id: string | null
          approved_by_name: string | null
          category: string
          created_at: string
          created_by_user_id: string
          id: string
          inspected_at: string | null
          inspector_id: string | null
          inspector_name: string | null
          items: Json
          notes: string | null
          photos: Json | null
          project_id: string
          room_id: string | null
          status: string
          task_id: string | null
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_id?: string | null
          approved_by_name?: string | null
          category?: string
          created_at?: string
          created_by_user_id: string
          id?: string
          inspected_at?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          items?: Json
          notes?: string | null
          photos?: Json | null
          project_id: string
          room_id?: string | null
          status?: string
          task_id?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_id?: string | null
          approved_by_name?: string | null
          category?: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          inspected_at?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          items?: Json
          notes?: string | null
          photos?: Json | null
          project_id?: string
          room_id?: string | null
          status?: string
          task_id?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_approved_by_id_fkey"
            columns: ["approved_by_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_approved_by_id_fkey"
            columns: ["approved_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          comment: string | null
          created_at: string | null
          description: string
          discount_percent: number | null
          id: string
          invoice_id: string
          is_rot_eligible: boolean | null
          quantity: number
          room_id: string | null
          rot_deduction: number | null
          sort_order: number | null
          source_task_id: string | null
          total_price: number | null
          unit: string | null
          unit_price: number
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          description: string
          discount_percent?: number | null
          id?: string
          invoice_id: string
          is_rot_eligible?: boolean | null
          quantity?: number
          room_id?: string | null
          rot_deduction?: number | null
          sort_order?: number | null
          source_task_id?: string | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          description?: string
          discount_percent?: number | null
          id?: string
          invoice_id?: string
          is_rot_eligible?: boolean | null
          quantity?: number
          room_id?: string | null
          rot_deduction?: number | null
          sort_order?: number | null
          source_task_id?: string | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          bank_account_number: string | null
          bankgiro: string | null
          client_id: string | null
          client_id_ref: string | null
          created_at: string | null
          creator_id: string
          description: string | null
          due_date: string | null
          free_text: string | null
          id: string
          invoice_number: string | null
          invoicing_method: string | null
          is_ata: boolean | null
          notes: string | null
          ocr_reference: string | null
          paid_amount: number | null
          paid_at: string | null
          payment_terms_days: number | null
          project_id: string
          quote_id: string | null
          sent_at: string | null
          status: string
          title: string
          total_after_rot: number | null
          total_amount: number | null
          total_rot_deduction: number | null
          updated_at: string | null
          viewed_at: string | null
        }
        Insert: {
          bank_account_number?: string | null
          bankgiro?: string | null
          client_id?: string | null
          client_id_ref?: string | null
          created_at?: string | null
          creator_id: string
          description?: string | null
          due_date?: string | null
          free_text?: string | null
          id?: string
          invoice_number?: string | null
          invoicing_method?: string | null
          is_ata?: boolean | null
          notes?: string | null
          ocr_reference?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_terms_days?: number | null
          project_id: string
          quote_id?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          total_after_rot?: number | null
          total_amount?: number | null
          total_rot_deduction?: number | null
          updated_at?: string | null
          viewed_at?: string | null
        }
        Update: {
          bank_account_number?: string | null
          bankgiro?: string | null
          client_id?: string | null
          client_id_ref?: string | null
          created_at?: string | null
          creator_id?: string
          description?: string | null
          due_date?: string | null
          free_text?: string | null
          id?: string
          invoice_number?: string | null
          invoicing_method?: string | null
          is_ata?: boolean | null
          notes?: string | null
          ocr_reference?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_terms_days?: number | null
          project_id?: string
          quote_id?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          total_after_rot?: number | null
          total_amount?: number | null
          total_rot_deduction?: number | null
          updated_at?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      material_rot_allocations: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          material_id: string
          rot_person_id: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          id?: string
          material_id: string
          rot_person_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          material_id?: string
          rot_person_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_rot_allocations_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_rot_allocations_rot_person_id_fkey"
            columns: ["rot_person_id"]
            isOneToOne: false
            referencedRelation: "project_rot_persons"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          assigned_to_user_id: string | null
          cost: number | null
          created_at: string
          created_by_user_id: string
          description: string | null
          exclude_from_budget: boolean | null
          id: string
          markup_percent: number | null
          name: string
          ordered_amount: number | null
          paid_amount: number | null
          paid_date: string | null
          price_per_unit: number | null
          price_total: number | null
          project_id: string | null
          quantity: number | null
          room_id: string | null
          room_ids: string[] | null
          rot_amount: number | null
          source_material_id: string | null
          status: string
          supplier_id: string | null
          task_id: string | null
          unit: string | null
          updated_at: string
          vendor_link: string | null
          vendor_name: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          cost?: number | null
          created_at?: string
          created_by_user_id: string
          description?: string | null
          exclude_from_budget?: boolean | null
          id?: string
          markup_percent?: number | null
          name: string
          ordered_amount?: number | null
          paid_amount?: number | null
          paid_date?: string | null
          price_per_unit?: number | null
          price_total?: number | null
          project_id?: string | null
          quantity?: number | null
          room_id?: string | null
          room_ids?: string[] | null
          rot_amount?: number | null
          source_material_id?: string | null
          status?: string
          supplier_id?: string | null
          task_id?: string | null
          unit?: string | null
          updated_at?: string
          vendor_link?: string | null
          vendor_name?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          cost?: number | null
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          exclude_from_budget?: boolean | null
          id?: string
          markup_percent?: number | null
          name?: string
          ordered_amount?: number | null
          paid_amount?: number | null
          paid_date?: string | null
          price_per_unit?: number | null
          price_total?: number | null
          project_id?: string | null
          quantity?: number | null
          room_id?: string | null
          room_ids?: string[] | null
          rot_amount?: number | null
          source_material_id?: string | null
          status?: string
          supplier_id?: string | null
          task_id?: string | null
          unit?: string | null
          updated_at?: string
          vendor_link?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_source_material_id_fkey"
            columns: ["source_material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          color: string | null
          created_at: string | null
          created_by_user_id: string | null
          date: string
          id: string
          project_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          date: string
          id?: string
          project_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          date?: string
          id?: string
          project_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestones_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string
          created_by_user_id: string
          id: string
          linked_to_id: string
          linked_to_type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by_user_id: string
          id?: string
          linked_to_id: string
          linked_to_type: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          linked_to_id?: string
          linked_to_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          caption: string | null
          created_at: string
          crop_offset_x: number | null
          crop_offset_y: number | null
          crop_position: string | null
          crop_shape: string | null
          crop_zoom: number | null
          display_size: string | null
          fit_mode: string | null
          grid_col_span: number
          grid_row_span: number
          id: string
          linked_to_id: string
          linked_to_type: string
          mime_type: string | null
          pinterest_pin_id: string | null
          sort_order: number | null
          source: string | null
          source_url: string | null
          uploaded_by_user_id: string
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          crop_offset_x?: number | null
          crop_offset_y?: number | null
          crop_position?: string | null
          crop_shape?: string | null
          crop_zoom?: number | null
          display_size?: string | null
          fit_mode?: string | null
          grid_col_span?: number
          grid_row_span?: number
          id?: string
          linked_to_id: string
          linked_to_type: string
          mime_type?: string | null
          pinterest_pin_id?: string | null
          sort_order?: number | null
          source?: string | null
          source_url?: string | null
          uploaded_by_user_id: string
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          crop_offset_x?: number | null
          crop_offset_y?: number | null
          crop_position?: string | null
          crop_shape?: string | null
          crop_zoom?: number | null
          display_size?: string | null
          fit_mode?: string | null
          grid_col_span?: number
          grid_row_span?: number
          id?: string
          linked_to_id?: string
          linked_to_type?: string
          mime_type?: string | null
          pinterest_pin_id?: string | null
          sort_order?: number | null
          source?: string | null
          source_url?: string | null
          uploaded_by_user_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string
          id: string
          pinterest_user_id: string | null
          pinterest_username: string | null
          refresh_token: string
          scope: string | null
          token_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at: string
          id?: string
          pinterest_user_id?: string | null
          pinterest_username?: string | null
          refresh_token: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          pinterest_user_id?: string | null
          pinterest_username?: string | null
          refresh_token?: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          average_rating: number | null
          bank_account_number: string | null
          bankgiro: string | null
          certifications: Json | null
          company_address: string | null
          company_city: string | null
          company_country: string | null
          company_description: string | null
          company_logo_url: string | null
          company_name: string | null
          company_postal_code: string | null
          company_website: string | null
          contractor_category: string | null
          created_at: string
          default_hourly_rate: number | null
          default_labor_cost_percent: number | null
          default_payment_terms_days: number | null
          email: string | null
          estimation_settings: Json | null
          id: string
          is_professional: boolean
          is_system_admin: boolean | null
          language_preference: string | null
          latitude: number | null
          longitude: number | null
          measurement_system: string | null
          name: string
          onboarding_asked_household: boolean | null
          onboarding_completed_at: string | null
          onboarding_completed_profile: boolean | null
          onboarding_created_project: boolean | null
          onboarding_created_quote: boolean | null
          onboarding_created_task_room: boolean | null
          onboarding_dismissed: boolean | null
          onboarding_drawn_room: boolean | null
          onboarding_entered_canvas: boolean | null
          onboarding_generated_walls: boolean | null
          onboarding_invited_team: boolean | null
          onboarding_reviewed_rooms: boolean | null
          onboarding_user_type: string | null
          onboarding_welcome_completed: boolean | null
          org_number: string | null
          personnummer: string | null
          phone: string | null
          role: string | null
          ui_preferences: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          average_rating?: number | null
          bank_account_number?: string | null
          bankgiro?: string | null
          certifications?: Json | null
          company_address?: string | null
          company_city?: string | null
          company_country?: string | null
          company_description?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          company_postal_code?: string | null
          company_website?: string | null
          contractor_category?: string | null
          created_at?: string
          default_hourly_rate?: number | null
          default_labor_cost_percent?: number | null
          default_payment_terms_days?: number | null
          email?: string | null
          estimation_settings?: Json | null
          id?: string
          is_professional?: boolean
          is_system_admin?: boolean | null
          language_preference?: string | null
          latitude?: number | null
          longitude?: number | null
          measurement_system?: string | null
          name: string
          onboarding_asked_household?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_completed_profile?: boolean | null
          onboarding_created_project?: boolean | null
          onboarding_created_quote?: boolean | null
          onboarding_created_task_room?: boolean | null
          onboarding_dismissed?: boolean | null
          onboarding_drawn_room?: boolean | null
          onboarding_entered_canvas?: boolean | null
          onboarding_generated_walls?: boolean | null
          onboarding_invited_team?: boolean | null
          onboarding_reviewed_rooms?: boolean | null
          onboarding_user_type?: string | null
          onboarding_welcome_completed?: boolean | null
          org_number?: string | null
          personnummer?: string | null
          phone?: string | null
          role?: string | null
          ui_preferences?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          average_rating?: number | null
          bank_account_number?: string | null
          bankgiro?: string | null
          certifications?: Json | null
          company_address?: string | null
          company_city?: string | null
          company_country?: string | null
          company_description?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          company_postal_code?: string | null
          company_website?: string | null
          contractor_category?: string | null
          created_at?: string
          default_hourly_rate?: number | null
          default_labor_cost_percent?: number | null
          default_payment_terms_days?: number | null
          email?: string | null
          estimation_settings?: Json | null
          id?: string
          is_professional?: boolean
          is_system_admin?: boolean | null
          language_preference?: string | null
          latitude?: number | null
          longitude?: number | null
          measurement_system?: string | null
          name?: string
          onboarding_asked_household?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_completed_profile?: boolean | null
          onboarding_created_project?: boolean | null
          onboarding_created_quote?: boolean | null
          onboarding_created_task_room?: boolean | null
          onboarding_dismissed?: boolean | null
          onboarding_drawn_room?: boolean | null
          onboarding_entered_canvas?: boolean | null
          onboarding_generated_walls?: boolean | null
          onboarding_invited_team?: boolean | null
          onboarding_reviewed_rooms?: boolean | null
          onboarding_user_type?: string | null
          onboarding_welcome_completed?: boolean | null
          org_number?: string | null
          personnummer?: string | null
          phone?: string | null
          role?: string | null
          ui_preferences?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_invitations: {
        Row: {
          accepted_at: string | null
          access_level: string
          budget_access: string | null
          contractor_role: Database["public"]["Enums"]["contractor_role"]
          created_at: string
          delivery_method: string | null
          email: string | null
          expires_at: string
          files_access: string | null
          id: string
          invitation_token: string
          invited_by_user_id: string
          invited_email: string
          invited_name: string | null
          invited_phone: string | null
          overview_access: string | null
          permissions_snapshot: Json | null
          phone: string | null
          project_id: string
          purchases_access: string | null
          purchases_scope: string | null
          related_invoice_id: string | null
          related_quote_id: string | null
          role: string | null
          role_type: string | null
          space_planner_access: string | null
          status: string
          tasks_access: string | null
          tasks_scope: string | null
          teams_access: string | null
          timeline_access: string | null
          token: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          access_level?: string
          budget_access?: string | null
          contractor_role: Database["public"]["Enums"]["contractor_role"]
          created_at?: string
          delivery_method?: string | null
          email?: string | null
          expires_at?: string
          files_access?: string | null
          id?: string
          invitation_token?: string
          invited_by_user_id: string
          invited_email: string
          invited_name?: string | null
          invited_phone?: string | null
          overview_access?: string | null
          permissions_snapshot?: Json | null
          phone?: string | null
          project_id: string
          purchases_access?: string | null
          purchases_scope?: string | null
          related_invoice_id?: string | null
          related_quote_id?: string | null
          role?: string | null
          role_type?: string | null
          space_planner_access?: string | null
          status?: string
          tasks_access?: string | null
          tasks_scope?: string | null
          teams_access?: string | null
          timeline_access?: string | null
          token?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          access_level?: string
          budget_access?: string | null
          contractor_role?: Database["public"]["Enums"]["contractor_role"]
          created_at?: string
          delivery_method?: string | null
          email?: string | null
          expires_at?: string
          files_access?: string | null
          id?: string
          invitation_token?: string
          invited_by_user_id?: string
          invited_email?: string
          invited_name?: string | null
          invited_phone?: string | null
          overview_access?: string | null
          permissions_snapshot?: Json | null
          phone?: string | null
          project_id?: string
          purchases_access?: string | null
          purchases_scope?: string | null
          related_invoice_id?: string | null
          related_quote_id?: string | null
          role?: string | null
          role_type?: string | null
          space_planner_access?: string | null
          status?: string
          tasks_access?: string | null
          tasks_scope?: string | null
          teams_access?: string | null
          timeline_access?: string | null
          token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invitations_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invitations_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invitations_related_invoice_id_fkey"
            columns: ["related_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invitations_related_quote_id_fkey"
            columns: ["related_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_rot_persons: {
        Row: {
          created_at: string | null
          custom_yearly_limit: number | null
          id: string
          name: string
          personnummer: string | null
          profile_id: string | null
          project_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_yearly_limit?: number | null
          id?: string
          name: string
          personnummer?: string | null
          profile_id?: string | null
          project_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_yearly_limit?: number | null
          id?: string
          name?: string
          personnummer?: string | null
          profile_id?: string | null
          project_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_rot_persons_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_rot_persons_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_rot_persons_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_shares: {
        Row: {
          budget_access: string | null
          can_create_purchase_requests: boolean | null
          company: string | null
          contractor_category: string | null
          contractor_role: Database["public"]["Enums"]["contractor_role"] | null
          created_at: string
          customer_view_access: string | null
          display_email: string | null
          display_name: string | null
          files_access: string | null
          id: string
          notes: string | null
          overview_access: string | null
          phone: string | null
          project_id: string
          purchases_access: string | null
          purchases_scope: string | null
          role: string | null
          role_type: string | null
          shared_with_user_id: string | null
          space_planner_access: string | null
          tasks_access: string | null
          tasks_scope: string | null
          teams_access: string | null
          time_tracking_access: string | null
          timeline_access: string | null
        }
        Insert: {
          budget_access?: string | null
          can_create_purchase_requests?: boolean | null
          company?: string | null
          contractor_category?: string | null
          contractor_role?:
            | Database["public"]["Enums"]["contractor_role"]
            | null
          created_at?: string
          customer_view_access?: string | null
          display_email?: string | null
          display_name?: string | null
          files_access?: string | null
          id?: string
          notes?: string | null
          overview_access?: string | null
          phone?: string | null
          project_id: string
          purchases_access?: string | null
          purchases_scope?: string | null
          role?: string | null
          role_type?: string | null
          shared_with_user_id?: string | null
          space_planner_access?: string | null
          tasks_access?: string | null
          tasks_scope?: string | null
          teams_access?: string | null
          time_tracking_access?: string | null
          timeline_access?: string | null
        }
        Update: {
          budget_access?: string | null
          can_create_purchase_requests?: boolean | null
          company?: string | null
          contractor_category?: string | null
          contractor_role?:
            | Database["public"]["Enums"]["contractor_role"]
            | null
          created_at?: string
          customer_view_access?: string | null
          display_email?: string | null
          display_name?: string | null
          files_access?: string | null
          id?: string
          notes?: string | null
          overview_access?: string | null
          phone?: string | null
          project_id?: string
          purchases_access?: string | null
          purchases_scope?: string | null
          role?: string | null
          role_type?: string | null
          shared_with_user_id?: string | null
          space_planner_access?: string | null
          tasks_access?: string | null
          tasks_scope?: string | null
          teams_access?: string | null
          time_tracking_access?: string | null
          timeline_access?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_shares_shared_with_user_id_fkey"
            columns: ["shared_with_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_shares_shared_with_user_id_fkey"
            columns: ["shared_with_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          city: string | null
          client_id: string | null
          country: string
          cover_image_position: number | null
          cover_image_url: string | null
          cover_image_zoom: number | null
          created_at: string
          currency: string | null
          deleted_at: string | null
          description: string | null
          finish_goal_date: string | null
          floor_plan_data: Json | null
          id: string
          locked_at: string | null
          locked_by_quote_id: string | null
          locked_for_quote: boolean | null
          name: string
          owner_id: string
          postal_code: string | null
          project_type: string | null
          property_designation: string | null
          source_rfq_project_id: string | null
          spent_amount: number | null
          start_date: string | null
          status: string | null
          total_budget: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_id?: string | null
          country?: string
          cover_image_position?: number | null
          cover_image_url?: string | null
          cover_image_zoom?: number | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          finish_goal_date?: string | null
          floor_plan_data?: Json | null
          id?: string
          locked_at?: string | null
          locked_by_quote_id?: string | null
          locked_for_quote?: boolean | null
          name: string
          owner_id: string
          postal_code?: string | null
          project_type?: string | null
          property_designation?: string | null
          source_rfq_project_id?: string | null
          spent_amount?: number | null
          start_date?: string | null
          status?: string | null
          total_budget?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          client_id?: string | null
          country?: string
          cover_image_position?: number | null
          cover_image_url?: string | null
          cover_image_zoom?: number | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          finish_goal_date?: string | null
          floor_plan_data?: Json | null
          id?: string
          locked_at?: string | null
          locked_by_quote_id?: string | null
          locked_for_quote?: boolean | null
          name?: string
          owner_id?: string
          postal_code?: string | null
          project_type?: string | null
          property_designation?: string | null
          source_rfq_project_id?: string | null
          spent_amount?: number | null
          start_date?: string | null
          status?: string | null
          total_budget?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_locked_by_quote_id_fkey"
            columns: ["locked_by_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_source_rfq_project_id_fkey"
            columns: ["source_rfq_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          created_at: string
          id: string
          material_id: string
          notes: string | null
          requested_by_user_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          notes?: string | null
          requested_by_user_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          notes?: string | null
          requested_by_user_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          comment: string | null
          created_at: string | null
          description: string
          discount_percent: number | null
          id: string
          is_rot_eligible: boolean | null
          quantity: number
          quote_id: string
          room_id: string | null
          rot_deduction: number | null
          sort_order: number | null
          source_task_id: string | null
          source_type: string | null
          total_price: number | null
          unit: string | null
          unit_price: number
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          description: string
          discount_percent?: number | null
          id?: string
          is_rot_eligible?: boolean | null
          quantity?: number
          quote_id: string
          room_id?: string | null
          rot_deduction?: number | null
          sort_order?: number | null
          source_task_id?: string | null
          source_type?: string | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          description?: string
          discount_percent?: number | null
          id?: string
          is_rot_eligible?: boolean | null
          quantity?: number
          quote_id?: string
          room_id?: string | null
          rot_deduction?: number | null
          sort_order?: number | null
          source_task_id?: string | null
          source_type?: string | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string | null
          client_id_ref: string | null
          created_at: string | null
          creator_id: string
          description: string | null
          free_text: string | null
          id: string
          intake_request_id: string | null
          is_ata: boolean | null
          notes: string | null
          project_id: string
          quote_number: string | null
          revised_from: string | null
          status: string
          title: string
          total_after_rot: number | null
          total_amount: number | null
          total_rot_deduction: number | null
          updated_at: string | null
          valid_until: string | null
          viewed_at: string | null
        }
        Insert: {
          client_id?: string | null
          client_id_ref?: string | null
          created_at?: string | null
          creator_id: string
          description?: string | null
          free_text?: string | null
          id?: string
          intake_request_id?: string | null
          is_ata?: boolean | null
          notes?: string | null
          project_id: string
          quote_number?: string | null
          revised_from?: string | null
          status?: string
          title?: string
          total_after_rot?: number | null
          total_amount?: number | null
          total_rot_deduction?: number | null
          updated_at?: string | null
          valid_until?: string | null
          viewed_at?: string | null
        }
        Update: {
          client_id?: string | null
          client_id_ref?: string | null
          created_at?: string | null
          creator_id?: string
          description?: string | null
          free_text?: string | null
          id?: string
          intake_request_id?: string | null
          is_ata?: boolean | null
          notes?: string | null
          project_id?: string
          quote_number?: string | null
          revised_from?: string | null
          status?: string
          title?: string
          total_after_rot?: number | null
          total_amount?: number | null
          total_rot_deduction?: number | null
          updated_at?: string | null
          valid_until?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_client_id_ref_fkey"
            columns: ["client_id_ref"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_intake_request_id_fkey"
            columns: ["intake_request_id"]
            isOneToOne: false
            referencedRelation: "customer_intake_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_revised_from_fkey"
            columns: ["revised_from"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          ceiling_color: string | null
          ceiling_height_mm: number | null
          ceiling_spec: Json | null
          checklists: Json | null
          color: string | null
          created_at: string
          description: string | null
          dimensions: Json | null
          electrical_spec: Json | null
          floor_plan_position: Json | null
          floor_spec: Json | null
          heating_spec: Json | null
          id: string
          joinery_spec: Json | null
          links: string | null
          material: string | null
          name: string
          notes: string | null
          pinterest_board_url: string | null
          priority: string | null
          project_id: string
          status: string | null
          trim_color: string | null
          updated_at: string
          wall_color: string | null
          wall_spec: Json | null
        }
        Insert: {
          ceiling_color?: string | null
          ceiling_height_mm?: number | null
          ceiling_spec?: Json | null
          checklists?: Json | null
          color?: string | null
          created_at?: string
          description?: string | null
          dimensions?: Json | null
          electrical_spec?: Json | null
          floor_plan_position?: Json | null
          floor_spec?: Json | null
          heating_spec?: Json | null
          id?: string
          joinery_spec?: Json | null
          links?: string | null
          material?: string | null
          name: string
          notes?: string | null
          pinterest_board_url?: string | null
          priority?: string | null
          project_id: string
          status?: string | null
          trim_color?: string | null
          updated_at?: string
          wall_color?: string | null
          wall_spec?: Json | null
        }
        Update: {
          ceiling_color?: string | null
          ceiling_height_mm?: number | null
          ceiling_spec?: Json | null
          checklists?: Json | null
          color?: string | null
          created_at?: string
          description?: string | null
          dimensions?: Json | null
          electrical_spec?: Json | null
          floor_plan_position?: Json | null
          floor_spec?: Json | null
          heating_spec?: Json | null
          id?: string
          joinery_spec?: Json | null
          links?: string | null
          material?: string | null
          name?: string
          notes?: string | null
          pinterest_board_url?: string | null
          priority?: string | null
          project_id?: string
          status?: string | null
          trim_color?: string | null
          updated_at?: string
          wall_color?: string | null
          wall_spec?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rot_yearly_limits: {
        Row: {
          combined_rot_rut_limit: number
          created_at: string | null
          id: string
          max_amount_per_person: number
          notes: string | null
          source_url: string | null
          subsidy_percent: number
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
          year: number
        }
        Insert: {
          combined_rot_rut_limit?: number
          created_at?: string | null
          id?: string
          max_amount_per_person?: number
          notes?: string | null
          source_url?: string | null
          subsidy_percent?: number
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
          year: number
        }
        Update: {
          combined_rot_rut_limit?: number
          created_at?: string | null
          id?: string
          max_amount_per_person?: number
          notes?: string | null
          source_url?: string | null
          subsidy_percent?: number
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
          year?: number
        }
        Relationships: []
      }
      stakeholders: {
        Row: {
          company: string | null
          contractor_category: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          project_id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          contractor_category?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          project_id: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          contractor_category?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          project_id?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stakeholders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          name: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          depends_on_task_id: string
          id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          depends_on_task_id: string
          id?: string
          task_id: string
        }
        Update: {
          created_at?: string
          depends_on_task_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_file_links: {
        Row: {
          ai_summary: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string
          id: string
          invoice_amount: number | null
          invoice_date: string | null
          linked_by_user_id: string | null
          material_id: string | null
          mime_type: string | null
          project_id: string
          room_id: string | null
          rot_amount: number | null
          task_id: string | null
          vendor_name: string | null
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string
          id?: string
          invoice_amount?: number | null
          invoice_date?: string | null
          linked_by_user_id?: string | null
          material_id?: string | null
          mime_type?: string | null
          project_id: string
          room_id?: string | null
          rot_amount?: number | null
          task_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          id?: string
          invoice_amount?: number | null
          invoice_date?: string | null
          linked_by_user_id?: string | null
          material_id?: string | null
          mime_type?: string | null
          project_id?: string
          room_id?: string | null
          rot_amount?: number | null
          task_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_file_links_linked_by_user_id_fkey"
            columns: ["linked_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_file_links_linked_by_user_id_fkey"
            columns: ["linked_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_file_links_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_file_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_file_links_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_file_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_translations: {
        Row: {
          checklists: Json | null
          description: string | null
          language: string
          task_id: string
          title: string | null
          translated_at: string
        }
        Insert: {
          checklists?: Json | null
          description?: string | null
          language: string
          task_id: string
          title?: string | null
          translated_at?: string
        }
        Update: {
          checklists?: Json | null
          description?: string | null
          language?: string
          task_id?: string
          title?: string | null
          translated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_translations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to_contractor_id: string | null
          assigned_to_stakeholder_id: string | null
          ata_approved_at: string | null
          ata_approved_by_name: string | null
          ata_rejection_reason: string | null
          ata_status: string | null
          budget: number | null
          checklists: Json | null
          cost_center: string | null
          cost_centers: string[] | null
          created_at: string
          created_by_user_id: string
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          finish_date: string | null
          floor_plan_position: Json | null
          hourly_rate: number | null
          id: string
          invoice_due_date: string | null
          invoice_number: string | null
          invoiced_amount: number | null
          invoiced_percent: number | null
          is_ata: boolean | null
          labor_cost_percent: number | null
          markup_percent: number | null
          material_estimate: number | null
          material_items: Json | null
          material_markup_percent: number | null
          ocr_number: string | null
          ordered_amount: number | null
          paid_amount: number | null
          parent_task_id: string | null
          payment_status: string | null
          priority: string | null
          progress: number | null
          project_id: string
          room_id: string | null
          room_ids: string[] | null
          rot_amount: number | null
          rot_eligible: boolean | null
          start_date: string | null
          status: string | null
          subcontractor_cost: number | null
          supplier_id: string | null
          task_cost_type: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to_contractor_id?: string | null
          assigned_to_stakeholder_id?: string | null
          ata_approved_at?: string | null
          ata_approved_by_name?: string | null
          ata_rejection_reason?: string | null
          ata_status?: string | null
          budget?: number | null
          checklists?: Json | null
          cost_center?: string | null
          cost_centers?: string[] | null
          created_at?: string
          created_by_user_id: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          finish_date?: string | null
          floor_plan_position?: Json | null
          hourly_rate?: number | null
          id?: string
          invoice_due_date?: string | null
          invoice_number?: string | null
          invoiced_amount?: number | null
          invoiced_percent?: number | null
          is_ata?: boolean | null
          labor_cost_percent?: number | null
          markup_percent?: number | null
          material_estimate?: number | null
          material_items?: Json | null
          material_markup_percent?: number | null
          ocr_number?: string | null
          ordered_amount?: number | null
          paid_amount?: number | null
          parent_task_id?: string | null
          payment_status?: string | null
          priority?: string | null
          progress?: number | null
          project_id: string
          room_id?: string | null
          room_ids?: string[] | null
          rot_amount?: number | null
          rot_eligible?: boolean | null
          start_date?: string | null
          status?: string | null
          subcontractor_cost?: number | null
          supplier_id?: string | null
          task_cost_type?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to_contractor_id?: string | null
          assigned_to_stakeholder_id?: string | null
          ata_approved_at?: string | null
          ata_approved_by_name?: string | null
          ata_rejection_reason?: string | null
          ata_status?: string | null
          budget?: number | null
          checklists?: Json | null
          cost_center?: string | null
          cost_centers?: string[] | null
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          finish_date?: string | null
          floor_plan_position?: Json | null
          hourly_rate?: number | null
          id?: string
          invoice_due_date?: string | null
          invoice_number?: string | null
          invoiced_amount?: number | null
          invoiced_percent?: number | null
          is_ata?: boolean | null
          labor_cost_percent?: number | null
          markup_percent?: number | null
          material_estimate?: number | null
          material_items?: Json | null
          material_markup_percent?: number | null
          ocr_number?: string | null
          ordered_amount?: number | null
          paid_amount?: number | null
          parent_task_id?: string | null
          payment_status?: string | null
          priority?: string | null
          progress?: number | null
          project_id?: string
          room_id?: string | null
          room_ids?: string[] | null
          rot_amount?: number | null
          rot_eligible?: boolean | null
          start_date?: string | null
          status?: string | null
          subcontractor_cost?: number | null
          supplier_id?: string | null
          task_cost_type?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_contractor_id_fkey"
            columns: ["assigned_to_contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_stakeholder_id_fkey"
            columns: ["assigned_to_stakeholder_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_stakeholder_id_fkey"
            columns: ["assigned_to_stakeholder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          date: string
          description: string | null
          hourly_rate: number | null
          hours: number
          id: string
          project_id: string
          task_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          date: string
          description?: string | null
          hourly_rate?: number | null
          hours: number
          id?: string
          project_id: string
          task_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          date?: string
          description?: string | null
          hourly_rate?: number | null
          hours?: number
          id?: string
          project_id?: string
          task_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          admin_notes: string | null
          created_at: string
          email: string | null
          id: string
          message: string
          page_url: string | null
          status: string
          type: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message: string
          page_url?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          page_url?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      worker_access_tokens: {
        Row: {
          assigned_task_ids: string[]
          can_toggle_checklist: boolean
          can_upload_photos: boolean
          created_at: string
          created_by_user_id: string
          expires_at: string
          id: string
          last_accessed_at: string | null
          project_id: string
          revoked_at: string | null
          token: string
          welcome_message: string | null
          worker_email: string | null
          worker_language: string
          worker_name: string
          worker_phone: string | null
        }
        Insert: {
          assigned_task_ids?: string[]
          can_toggle_checklist?: boolean
          can_upload_photos?: boolean
          created_at?: string
          created_by_user_id: string
          expires_at?: string
          id?: string
          last_accessed_at?: string | null
          project_id: string
          revoked_at?: string | null
          token?: string
          welcome_message?: string | null
          worker_email?: string | null
          worker_language?: string
          worker_name: string
          worker_phone?: string | null
        }
        Update: {
          assigned_task_ids?: string[]
          can_toggle_checklist?: boolean
          can_upload_photos?: boolean
          created_at?: string
          created_by_user_id?: string
          expires_at?: string
          id?: string
          last_accessed_at?: string | null
          project_id?: string
          revoked_at?: string | null
          token?: string
          welcome_message?: string | null
          worker_email?: string | null
          worker_language?: string
          worker_name?: string
          worker_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_access_tokens_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_access_tokens_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_access_tokens_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_instruction_overrides: {
        Row: {
          checklist_override: Json | null
          created_at: string | null
          description_override: string | null
          id: string
          task_id: string
          worker_token_id: string
        }
        Insert: {
          checklist_override?: Json | null
          created_at?: string | null
          description_override?: string | null
          id?: string
          task_id: string
          worker_token_id: string
        }
        Update: {
          checklist_override?: Json | null
          created_at?: string | null
          description_override?: string | null
          id?: string
          task_id?: string
          worker_token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_instruction_overrides_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_instruction_overrides_worker_token_id_fkey"
            columns: ["worker_token_id"]
            isOneToOne: false
            referencedRelation: "worker_access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      entity_document_counts: {
        Row: {
          document_count: number | null
          entity_id: string | null
          entity_type: string | null
        }
        Relationships: []
      }
      professional_profiles: {
        Row: {
          avatar_url: string | null
          average_rating: number | null
          company_address: string | null
          company_city: string | null
          company_country: string | null
          company_description: string | null
          company_name: string | null
          company_postal_code: string | null
          company_website: string | null
          contractor_category: string | null
          created_at: string | null
          id: string | null
          is_professional: boolean | null
          latitude: number | null
          longitude: number | null
          name: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          average_rating?: number | null
          company_address?: string | null
          company_city?: string | null
          company_country?: string | null
          company_description?: string | null
          company_name?: string | null
          company_postal_code?: string | null
          company_website?: string | null
          contractor_category?: string | null
          created_at?: string | null
          id?: string | null
          is_professional?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          average_rating?: number | null
          company_address?: string | null
          company_city?: string | null
          company_country?: string | null
          company_description?: string | null
          company_name?: string | null
          company_postal_code?: string | null
          company_website?: string | null
          contractor_category?: string | null
          created_at?: string | null
          id?: string | null
          is_professional?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_intake_request_by_token: {
        Args: { p_token: string }
        Returns: {
          attachments: Json | null
          client_id: string | null
          created_at: string | null
          creator_id: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          desired_start_date: string | null
          expires_at: string | null
          greeting: string | null
          id: string
          images: Json | null
          project_description: string | null
          project_id: string | null
          property_address: string | null
          property_city: string | null
          property_postal_code: string | null
          property_type: string | null
          rooms_data: Json | null
          status: string
          submitted_at: string | null
          token: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "customer_intake_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_user_profile_id: { Args: never; Returns: string }
      get_visible_profile_ids: { Args: never; Returns: string[] }
      is_public_demo_project: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      is_system_admin: { Args: never; Returns: boolean }
      resolve_project_id_from_entity: {
        Args: { p_linked_to_id: string; p_linked_to_type: string }
        Returns: string
      }
      seed_demo_project_for_user:
        | { Args: { p_owner_id: string }; Returns: string }
        | { Args: { p_language?: string; p_owner_id: string }; Returns: string }
      user_can_invite_to_project: {
        Args: { project_uuid: string }
        Returns: boolean
      }
      user_can_manage_project: {
        Args: { project_uuid: string }
        Returns: boolean
      }
      user_can_manage_project_files: {
        Args: { file_path: string }
        Returns: boolean
      }
      user_can_manage_team: { Args: { project_uuid: string }; Returns: boolean }
      user_can_view_project_files: {
        Args: { file_path: string }
        Returns: boolean
      }
      user_has_project_access: {
        Args: { project_id: string }
        Returns: boolean
      }
      user_owns_project: { Args: { project_id: string }; Returns: boolean }
    }
    Enums: {
      contractor_role:
        | "painter"
        | "electrician"
        | "plumber"
        | "carpenter"
        | "designer"
        | "architect"
        | "general_contractor"
        | "supplier"
        | "other"
      work_type:
        | "rivning"
        | "el"
        | "vvs"
        | "kakel"
        | "snickeri"
        | "malning"
        | "golv"
        | "kok"
        | "badrum"
        | "fonster_dorrar"
        | "fasad"
        | "tak"
        | "tradgard"
        | "annat"
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
      contractor_role: [
        "painter",
        "electrician",
        "plumber",
        "carpenter",
        "designer",
        "architect",
        "general_contractor",
        "supplier",
        "other",
      ],
      work_type: [
        "rivning",
        "el",
        "vvs",
        "kakel",
        "snickeri",
        "malning",
        "golv",
        "kok",
        "badrum",
        "fonster_dorrar",
        "fasad",
        "tak",
        "tradgard",
        "annat",
      ],
    },
  },
} as const
<claude-code-hint v="1" type="plugin" value="supabase@claude-plugins-official" />
