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
      agencies: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          city: string | null
          code: string
          commercial_reg_no: string | null
          country_code: string
          created_at: string
          credit_limit: number
          currency_code: string
          email: string
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["agency_status"]
          tax_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          code: string
          commercial_reg_no?: string | null
          country_code: string
          created_at?: string
          credit_limit?: number
          currency_code?: string
          email: string
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["agency_status"]
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          code?: string
          commercial_reg_no?: string | null
          country_code?: string
          created_at?: string
          credit_limit?: number
          currency_code?: string
          email?: string
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["agency_status"]
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
        }
        Relationships: []
      }
      permissions: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          key: string
          module: string
          name_ar: string
          name_en: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          key: string
          module: string
          name_ar: string
          name_en: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          key?: string
          module?: string
          name_ar?: string
          name_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          agency_id: string | null
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          must_change_password: boolean
          phone: string | null
          preferred_locale: string
          role_id: string
          status: Database["public"]["Enums"]["user_status"]
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          must_change_password?: boolean
          phone?: string | null
          preferred_locale?: string
          role_id: string
          status?: Database["public"]["Enums"]["user_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          must_change_password?: boolean
          phone?: string | null
          preferred_locale?: string
          role_id?: string
          status?: Database["public"]["Enums"]["user_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          permission_key: string
          role_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          permission_key: string
          role_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          is_system: boolean
          key: string
          name_ar: string
          name_en: string
          scope: Database["public"]["Enums"]["role_scope"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_system?: boolean
          key: string
          name_ar: string
          name_en: string
          scope: Database["public"]["Enums"]["role_scope"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name_ar?: string
          name_en?: string
          scope?: Database["public"]["Enums"]["role_scope"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      agency_status_counts: {
        Row: {
          count: number | null
          status: Database["public"]["Enums"]["agency_status"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_agency: { Args: { p_agency_id: string }; Returns: undefined }
      authorize: { Args: { p_permission: string }; Returns: boolean }
      bootstrap_super_admin: { Args: { p_email: string }; Returns: string }
      can_read_own_agency: { Args: never; Returns: boolean }
      current_agency_id: { Args: never; Returns: string }
      current_role_id: { Args: never; Returns: string }
      has_permission: {
        Args: { p_permission: string; p_user_id: string }
        Returns: boolean
      }
      is_active_user: { Args: never; Returns: boolean }
      is_super_admin: { Args: { p_user_id?: string }; Returns: boolean }
      reject_agency: {
        Args: { p_agency_id: string; p_reason: string }
        Returns: undefined
      }
      set_agency_status: {
        Args: {
          p_agency_id: string
          p_status: Database["public"]["Enums"]["agency_status"]
        }
        Returns: undefined
      }
      write_audit: {
        Args: {
          p_action: string
          p_changes?: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      agency_status: "pending" | "active" | "suspended" | "rejected"
      role_scope: "admin" | "agent"
      user_status: "pending" | "active" | "suspended" | "rejected"
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
      agency_status: ["pending", "active", "suspended", "rejected"],
      role_scope: ["admin", "agent"],
      user_status: ["pending", "active", "suspended", "rejected"],
    },
  },
} as const
