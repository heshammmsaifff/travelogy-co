export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      agencies: {
        Row: {
          address: string | null;
          approved_at: string | null;
          approved_by: string | null;
          city: string | null;
          code: string;
          commercial_reg_no: string | null;
          country_code: string;
          created_at: string;
          credit_limit: number;
          currency_code: string;
          email: string;
          id: string;
          legal_name: string | null;
          logo_url: string | null;
          name: string;
          phone: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          rejection_reason: string | null;
          status: Database["public"]["Enums"]["agency_status"];
          tax_id: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          city?: string | null;
          code: string;
          commercial_reg_no?: string | null;
          country_code: string;
          created_at?: string;
          credit_limit?: number;
          currency_code?: string;
          email: string;
          id?: string;
          legal_name?: string | null;
          logo_url?: string | null;
          name: string;
          phone?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_reason?: string | null;
          status?: Database["public"]["Enums"]["agency_status"];
          tax_id?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          city?: string | null;
          code?: string;
          commercial_reg_no?: string | null;
          country_code?: string;
          created_at?: string;
          credit_limit?: number;
          currency_code?: string;
          email?: string;
          id?: string;
          legal_name?: string | null;
          logo_url?: string | null;
          name?: string;
          phone?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_reason?: string | null;
          status?: Database["public"]["Enums"]["agency_status"];
          tax_id?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      allocations: {
        Row: {
          allotment: number;
          created_at: string;
          id: string;
          min_stay: number | null;
          room_type_id: string;
          sold: number;
          stay_date: string;
          stop_sell: boolean;
          updated_at: string;
        };
        Insert: {
          allotment?: number;
          created_at?: string;
          id?: string;
          min_stay?: number | null;
          room_type_id: string;
          sold?: number;
          stay_date: string;
          stop_sell?: boolean;
          updated_at?: string;
        };
        Update: {
          allotment?: number;
          created_at?: string;
          id?: string;
          min_stay?: number | null;
          room_type_id?: string;
          sold?: number;
          stay_date?: string;
          stop_sell?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "allocations_room_type_id_fkey";
            columns: ["room_type_id"];
            isOneToOne: false;
            referencedRelation: "room_types";
            referencedColumns: ["id"];
          },
        ];
      };
      amenities: {
        Row: {
          category: string;
          icon: string | null;
          key: string;
          name_ar: string;
          name_en: string;
          sort_order: number;
        };
        Insert: {
          category: string;
          icon?: string | null;
          key: string;
          name_ar: string;
          name_en: string;
          sort_order?: number;
        };
        Update: {
          category?: string;
          icon?: string | null;
          key?: string;
          name_ar?: string;
          name_en?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          changes: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: number;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          changes?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
        };
        Relationships: [];
      };
      cancellation_policies: {
        Row: {
          created_at: string;
          description_ar: string | null;
          description_en: string | null;
          hotel_id: string | null;
          id: string;
          is_non_refundable: boolean;
          name_ar: string;
          name_en: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          hotel_id?: string | null;
          id?: string;
          is_non_refundable?: boolean;
          name_ar: string;
          name_en: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          hotel_id?: string | null;
          id?: string;
          is_non_refundable?: boolean;
          name_ar?: string;
          name_en?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cancellation_policies_hotel_id_fkey";
            columns: ["hotel_id"];
            isOneToOne: false;
            referencedRelation: "hotels";
            referencedColumns: ["id"];
          },
        ];
      };
      cancellation_rules: {
        Row: {
          charge_type: Database["public"]["Enums"]["charge_type"];
          charge_value: number;
          created_at: string;
          hours_before_checkin: number;
          id: string;
          policy_id: string;
        };
        Insert: {
          charge_type: Database["public"]["Enums"]["charge_type"];
          charge_value: number;
          created_at?: string;
          hours_before_checkin: number;
          id?: string;
          policy_id: string;
        };
        Update: {
          charge_type?: Database["public"]["Enums"]["charge_type"];
          charge_value?: number;
          created_at?: string;
          hours_before_checkin?: number;
          id?: string;
          policy_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cancellation_rules_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "cancellation_policies";
            referencedColumns: ["id"];
          },
        ];
      };
      child_policies: {
        Row: {
          age_from: number;
          age_to: number;
          charge_type: Database["public"]["Enums"]["charge_type"];
          charge_value: number;
          created_at: string;
          hotel_id: string;
          id: string;
        };
        Insert: {
          age_from: number;
          age_to: number;
          charge_type?: Database["public"]["Enums"]["charge_type"];
          charge_value?: number;
          created_at?: string;
          hotel_id: string;
          id?: string;
        };
        Update: {
          age_from?: number;
          age_to?: number;
          charge_type?: Database["public"]["Enums"]["charge_type"];
          charge_value?: number;
          created_at?: string;
          hotel_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "child_policies_hotel_id_fkey";
            columns: ["hotel_id"];
            isOneToOne: false;
            referencedRelation: "hotels";
            referencedColumns: ["id"];
          },
        ];
      };
      hotel_amenities: {
        Row: {
          amenity_key: string;
          hotel_id: string;
        };
        Insert: {
          amenity_key: string;
          hotel_id: string;
        };
        Update: {
          amenity_key?: string;
          hotel_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hotel_amenities_amenity_key_fkey";
            columns: ["amenity_key"];
            isOneToOne: false;
            referencedRelation: "amenities";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "hotel_amenities_hotel_id_fkey";
            columns: ["hotel_id"];
            isOneToOne: false;
            referencedRelation: "hotels";
            referencedColumns: ["id"];
          },
        ];
      };
      hotel_images: {
        Row: {
          alt_ar: string | null;
          alt_en: string | null;
          bytes: number | null;
          cloudinary_public_id: string;
          created_at: string;
          height: number | null;
          hotel_id: string;
          id: string;
          is_cover: boolean;
          room_type_id: string | null;
          secure_url: string;
          sort_order: number;
          uploaded_by: string | null;
          width: number | null;
        };
        Insert: {
          alt_ar?: string | null;
          alt_en?: string | null;
          bytes?: number | null;
          cloudinary_public_id: string;
          created_at?: string;
          height?: number | null;
          hotel_id: string;
          id?: string;
          is_cover?: boolean;
          room_type_id?: string | null;
          secure_url: string;
          sort_order?: number;
          uploaded_by?: string | null;
          width?: number | null;
        };
        Update: {
          alt_ar?: string | null;
          alt_en?: string | null;
          bytes?: number | null;
          cloudinary_public_id?: string;
          created_at?: string;
          height?: number | null;
          hotel_id?: string;
          id?: string;
          is_cover?: boolean;
          room_type_id?: string | null;
          secure_url?: string;
          sort_order?: number;
          uploaded_by?: string | null;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "hotel_images_hotel_id_fkey";
            columns: ["hotel_id"];
            isOneToOne: false;
            referencedRelation: "hotels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hotel_images_room_type_id_fkey";
            columns: ["room_type_id"];
            isOneToOne: false;
            referencedRelation: "room_types";
            referencedColumns: ["id"];
          },
        ];
      };
      hotels: {
        Row: {
          address_ar: string | null;
          address_en: string | null;
          area_ar: string | null;
          area_en: string | null;
          check_in_time: string;
          check_out_time: string;
          city_ar: string;
          city_en: string;
          code: string;
          country_code: string;
          created_at: string;
          created_by: string | null;
          description_ar: string | null;
          description_en: string | null;
          email: string | null;
          id: string;
          internal_notes: string | null;
          latitude: number | null;
          longitude: number | null;
          name_ar: string;
          name_en: string;
          phone: string | null;
          property_type: Database["public"]["Enums"]["property_type"];
          star_rating: number | null;
          status: Database["public"]["Enums"]["hotel_status"];
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address_ar?: string | null;
          address_en?: string | null;
          area_ar?: string | null;
          area_en?: string | null;
          check_in_time?: string;
          check_out_time?: string;
          city_ar: string;
          city_en: string;
          code: string;
          country_code: string;
          created_at?: string;
          created_by?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          email?: string | null;
          id?: string;
          internal_notes?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          name_ar: string;
          name_en: string;
          phone?: string | null;
          property_type?: Database["public"]["Enums"]["property_type"];
          star_rating?: number | null;
          status?: Database["public"]["Enums"]["hotel_status"];
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address_ar?: string | null;
          address_en?: string | null;
          area_ar?: string | null;
          area_en?: string | null;
          check_in_time?: string;
          check_out_time?: string;
          city_ar?: string;
          city_en?: string;
          code?: string;
          country_code?: string;
          created_at?: string;
          created_by?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          email?: string | null;
          id?: string;
          internal_notes?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          name_ar?: string;
          name_en?: string;
          phone?: string | null;
          property_type?: Database["public"]["Enums"]["property_type"];
          star_rating?: number | null;
          status?: Database["public"]["Enums"]["hotel_status"];
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      meal_plans: {
        Row: {
          description_ar: string | null;
          description_en: string | null;
          key: string;
          name_ar: string;
          name_en: string;
          sort_order: number;
        };
        Insert: {
          description_ar?: string | null;
          description_en?: string | null;
          key: string;
          name_ar: string;
          name_en: string;
          sort_order?: number;
        };
        Update: {
          description_ar?: string | null;
          description_en?: string | null;
          key?: string;
          name_ar?: string;
          name_en?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      offer_rate_plans: {
        Row: {
          offer_id: string;
          rate_plan_id: string;
        };
        Insert: {
          offer_id: string;
          rate_plan_id: string;
        };
        Update: {
          offer_id?: string;
          rate_plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "offer_rate_plans_offer_id_fkey";
            columns: ["offer_id"];
            isOneToOne: false;
            referencedRelation: "offers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offer_rate_plans_rate_plan_id_fkey";
            columns: ["rate_plan_id"];
            isOneToOne: false;
            referencedRelation: "rate_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      offer_room_types: {
        Row: {
          offer_id: string;
          room_type_id: string;
        };
        Insert: {
          offer_id: string;
          room_type_id: string;
        };
        Update: {
          offer_id?: string;
          room_type_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "offer_room_types_offer_id_fkey";
            columns: ["offer_id"];
            isOneToOne: false;
            referencedRelation: "offers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offer_room_types_room_type_id_fkey";
            columns: ["room_type_id"];
            isOneToOne: false;
            referencedRelation: "room_types";
            referencedColumns: ["id"];
          },
        ];
      };
      offers: {
        Row: {
          booking_window: unknown;
          created_at: string;
          description_ar: string | null;
          description_en: string | null;
          discount_type: Database["public"]["Enums"]["charge_type"];
          discount_value: number;
          free_nights: number | null;
          hotel_id: string;
          id: string;
          is_active: boolean;
          min_nights: number | null;
          name_ar: string;
          name_en: string;
          offer_type: Database["public"]["Enums"]["offer_type"];
          sort_order: number;
          stay_window: unknown;
          updated_at: string;
        };
        Insert: {
          booking_window?: unknown;
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          discount_type?: Database["public"]["Enums"]["charge_type"];
          discount_value: number;
          free_nights?: number | null;
          hotel_id: string;
          id?: string;
          is_active?: boolean;
          min_nights?: number | null;
          name_ar: string;
          name_en: string;
          offer_type: Database["public"]["Enums"]["offer_type"];
          sort_order?: number;
          stay_window: unknown;
          updated_at?: string;
        };
        Update: {
          booking_window?: unknown;
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          discount_type?: Database["public"]["Enums"]["charge_type"];
          discount_value?: number;
          free_nights?: number | null;
          hotel_id?: string;
          id?: string;
          is_active?: boolean;
          min_nights?: number | null;
          name_ar?: string;
          name_en?: string;
          offer_type?: Database["public"]["Enums"]["offer_type"];
          sort_order?: number;
          stay_window?: unknown;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "offers_hotel_id_fkey";
            columns: ["hotel_id"];
            isOneToOne: false;
            referencedRelation: "hotels";
            referencedColumns: ["id"];
          },
        ];
      };
      permissions: {
        Row: {
          created_at: string;
          description_ar: string | null;
          description_en: string | null;
          key: string;
          module: string;
          name_ar: string;
          name_en: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          key: string;
          module: string;
          name_ar: string;
          name_en: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          key?: string;
          module?: string;
          name_ar?: string;
          name_en?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          agency_id: string | null;
          approved_at: string | null;
          approved_by: string | null;
          avatar_url: string | null;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          must_change_password: boolean;
          phone: string | null;
          preferred_locale: string;
          role_id: string;
          status: Database["public"]["Enums"]["user_status"];
          suspended_at: string | null;
          suspension_reason: string | null;
          updated_at: string;
        };
        Insert: {
          agency_id?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          full_name?: string;
          id: string;
          must_change_password?: boolean;
          phone?: string | null;
          preferred_locale?: string;
          role_id: string;
          status?: Database["public"]["Enums"]["user_status"];
          suspended_at?: string | null;
          suspension_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          agency_id?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          must_change_password?: boolean;
          phone?: string | null;
          preferred_locale?: string;
          role_id?: string;
          status?: Database["public"]["Enums"]["user_status"];
          suspended_at?: string | null;
          suspension_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_plans: {
        Row: {
          cancellation_policy_id: string | null;
          code: string;
          created_at: string;
          currency_code: string;
          hotel_id: string;
          id: string;
          meal_plan_key: string;
          name_ar: string;
          name_en: string;
          status: Database["public"]["Enums"]["rate_plan_status"];
          updated_at: string;
          valid_from: string;
          valid_to: string;
        };
        Insert: {
          cancellation_policy_id?: string | null;
          code: string;
          created_at?: string;
          currency_code?: string;
          hotel_id: string;
          id?: string;
          meal_plan_key: string;
          name_ar: string;
          name_en: string;
          status?: Database["public"]["Enums"]["rate_plan_status"];
          updated_at?: string;
          valid_from: string;
          valid_to: string;
        };
        Update: {
          cancellation_policy_id?: string | null;
          code?: string;
          created_at?: string;
          currency_code?: string;
          hotel_id?: string;
          id?: string;
          meal_plan_key?: string;
          name_ar?: string;
          name_en?: string;
          status?: Database["public"]["Enums"]["rate_plan_status"];
          updated_at?: string;
          valid_from?: string;
          valid_to?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rate_plans_cancellation_policy_id_fkey";
            columns: ["cancellation_policy_id"];
            isOneToOne: false;
            referencedRelation: "cancellation_policies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rate_plans_hotel_id_fkey";
            columns: ["hotel_id"];
            isOneToOne: false;
            referencedRelation: "hotels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rate_plans_meal_plan_key_fkey";
            columns: ["meal_plan_key"];
            isOneToOne: false;
            referencedRelation: "meal_plans";
            referencedColumns: ["key"];
          },
        ];
      };
      rates: {
        Row: {
          created_at: string;
          extra_adult_price: number;
          extra_child_price: number;
          id: string;
          is_closed: boolean;
          max_stay: number | null;
          min_stay: number;
          price_per_night: number;
          rate_plan_id: string;
          room_type_id: string;
          single_occupancy_price: number | null;
          stay_period: unknown;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          extra_adult_price?: number;
          extra_child_price?: number;
          id?: string;
          is_closed?: boolean;
          max_stay?: number | null;
          min_stay?: number;
          price_per_night: number;
          rate_plan_id: string;
          room_type_id: string;
          single_occupancy_price?: number | null;
          stay_period: unknown;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          extra_adult_price?: number;
          extra_child_price?: number;
          id?: string;
          is_closed?: boolean;
          max_stay?: number | null;
          min_stay?: number;
          price_per_night?: number;
          rate_plan_id?: string;
          room_type_id?: string;
          single_occupancy_price?: number | null;
          stay_period?: unknown;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rates_rate_plan_id_fkey";
            columns: ["rate_plan_id"];
            isOneToOne: false;
            referencedRelation: "rate_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rates_room_type_id_fkey";
            columns: ["room_type_id"];
            isOneToOne: false;
            referencedRelation: "room_types";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          permission_key: string;
          role_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          permission_key: string;
          role_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          permission_key?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey";
            columns: ["permission_key"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          description_ar: string | null;
          description_en: string | null;
          id: string;
          is_system: boolean;
          key: string;
          name_ar: string;
          name_en: string;
          scope: Database["public"]["Enums"]["role_scope"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          id?: string;
          is_system?: boolean;
          key: string;
          name_ar: string;
          name_en: string;
          scope: Database["public"]["Enums"]["role_scope"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          id?: string;
          is_system?: boolean;
          key?: string;
          name_ar?: string;
          name_en?: string;
          scope?: Database["public"]["Enums"]["role_scope"];
          updated_at?: string;
        };
        Relationships: [];
      };
      room_types: {
        Row: {
          bed_configuration_ar: string | null;
          bed_configuration_en: string | null;
          code: string;
          created_at: string;
          description_ar: string | null;
          description_en: string | null;
          hotel_id: string;
          id: string;
          max_adults: number;
          max_children: number;
          max_occupancy: number;
          name_ar: string;
          name_en: string;
          size_sqm: number | null;
          sort_order: number;
          standard_occupancy: number;
          status: Database["public"]["Enums"]["room_status"];
          total_rooms: number;
          updated_at: string;
        };
        Insert: {
          bed_configuration_ar?: string | null;
          bed_configuration_en?: string | null;
          code: string;
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          hotel_id: string;
          id?: string;
          max_adults?: number;
          max_children?: number;
          max_occupancy: number;
          name_ar: string;
          name_en: string;
          size_sqm?: number | null;
          sort_order?: number;
          standard_occupancy?: number;
          status?: Database["public"]["Enums"]["room_status"];
          total_rooms?: number;
          updated_at?: string;
        };
        Update: {
          bed_configuration_ar?: string | null;
          bed_configuration_en?: string | null;
          code?: string;
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          hotel_id?: string;
          id?: string;
          max_adults?: number;
          max_children?: number;
          max_occupancy?: number;
          name_ar?: string;
          name_en?: string;
          size_sqm?: number | null;
          sort_order?: number;
          standard_occupancy?: number;
          status?: Database["public"]["Enums"]["room_status"];
          total_rooms?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_types_hotel_id_fkey";
            columns: ["hotel_id"];
            isOneToOne: false;
            referencedRelation: "hotels";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      agency_status_counts: {
        Row: {
          count: number | null;
          status: Database["public"]["Enums"]["agency_status"] | null;
        };
        Relationships: [];
      };
      hotel_status_counts: {
        Row: {
          count: number | null;
          status: Database["public"]["Enums"]["hotel_status"] | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      approve_agency: { Args: { p_agency_id: string }; Returns: undefined };
      authorize: { Args: { p_permission: string }; Returns: boolean };
      bootstrap_super_admin: { Args: { p_email: string }; Returns: string };
      can_read_own_agency: { Args: never; Returns: boolean };
      current_agency_id: { Args: never; Returns: string };
      current_role_id: { Args: never; Returns: string };
      has_permission: {
        Args: { p_permission: string; p_user_id: string };
        Returns: boolean;
      };
      is_active_user: { Args: never; Returns: boolean };
      is_super_admin: { Args: { p_user_id?: string }; Returns: boolean };
      next_hotel_code: { Args: never; Returns: string };
      reject_agency: {
        Args: { p_agency_id: string; p_reason: string };
        Returns: undefined;
      };
      set_agency_status: {
        Args: {
          p_agency_id: string;
          p_status: Database["public"]["Enums"]["agency_status"];
        };
        Returns: undefined;
      };
      write_audit: {
        Args: {
          p_action: string;
          p_changes?: Json;
          p_entity_id: string;
          p_entity_type: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      agency_status: "pending" | "active" | "suspended" | "rejected";
      charge_type: "percentage" | "fixed" | "nights";
      hotel_status: "draft" | "active" | "inactive";
      offer_type: "early_bird" | "long_stay" | "free_nights" | "discount";
      property_type:
        "hotel" | "resort" | "apartment" | "villa" | "guesthouse" | "hostel" | "boutique";
      rate_plan_status: "draft" | "active" | "inactive";
      role_scope: "admin" | "agent";
      room_status: "active" | "inactive";
      user_status: "pending" | "active" | "suspended" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      agency_status: ["pending", "active", "suspended", "rejected"],
      charge_type: ["percentage", "fixed", "nights"],
      hotel_status: ["draft", "active", "inactive"],
      offer_type: ["early_bird", "long_stay", "free_nights", "discount"],
      property_type: ["hotel", "resort", "apartment", "villa", "guesthouse", "hostel", "boutique"],
      rate_plan_status: ["draft", "active", "inactive"],
      role_scope: ["admin", "agent"],
      room_status: ["active", "inactive"],
      user_status: ["pending", "active", "suspended", "rejected"],
    },
  },
} as const;
