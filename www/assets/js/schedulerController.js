/**
 * Scheduler Controller - Handles calendar, scheduling, and upcoming events
 */
class SchedulerController {
  constructor() {
    this.currentDate = new Date();
    this.selectedDate = new Date();
    this.events = [];
    this.eventsInitialized = false;
    this.initialized = false;
    this.editingEventId = null;  // Track the event being edited
    
    // Elements
    this.elements = {
      modal: document.getElementById('schedulerModal'),
      closeBtn: document.getElementById('closeSchedulerBtn'),
      calendarTab: document.getElementById('calendarTab'),
      upcomingTab: document.getElementById('upcomingTab'),
      calendarColumn: document.getElementById('calendarColumn'),
      upcomingColumn: document.getElementById('upcomingColumn'),
      prevMonthBtn: document.getElementById('prevMonth'),
      nextMonthBtn: document.getElementById('nextMonth'),
      currentMonthLabel: document.querySelector('.current-month'),
      calendarGrid: document.querySelector('.calendar-grid'),
      newEventForm: document.getElementById('newEventForm'),
      quickAddBtn: document.getElementById('quickAddBtn'),
      markCompleteBtn: document.getElementById('markCompleteBtn'),
      eventList: document.querySelector('.event-list')
    };
  }

  /**
   * Initialize the scheduler
   */
  async init() {
    if (this.initialized) return;
    
    try {
      // Setup event listeners
      this.setupEventListeners();
      
      // Generate initial calendar
      this.updateCalendar();
      
      // Load events
      await this.loadEvents();
      
      // Populate events
      this.populateEvents();
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing scheduler controller:', error);
    }
  }

  /**
   * Setup event listeners for calendar navigation and modal controls
   */
  setupEventListeners() {
    // Close button
    if (this.elements.closeBtn) {
      this.elements.closeBtn.addEventListener('click', () => {
        this.closeScheduler();
      });
    }
    
    // Click outside to close
    if (this.elements.modal) {
      this.elements.modal.addEventListener('click', (e) => {
        if (e.target === this.elements.modal) {
          this.closeScheduler();
        }
      });
    }
    
    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elements.modal && this.elements.modal.classList.contains('active')) {
        this.closeScheduler();
      }
    });
    
    // Tab navigation (mobile)
    if (this.elements.calendarTab && this.elements.upcomingTab) {
      this.elements.calendarTab.addEventListener('click', () => {
        this.switchTab('calendar');
      });
      
      this.elements.upcomingTab.addEventListener('click', () => {
        this.switchTab('upcoming');
      });
    }
    
    // Calendar navigation
    if (this.elements.prevMonthBtn) {
      this.elements.prevMonthBtn.addEventListener('click', () => {
        this.navigateMonth(-1);
      });
    }
    
    if (this.elements.nextMonthBtn) {
      this.elements.nextMonthBtn.addEventListener('click', () => {
        this.navigateMonth(1);
      });
    }
    
    // New event form
    if (this.elements.newEventForm) {
      this.elements.newEventForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.createNewEvent();
      });
    }
    
    // Quick add button
    if (this.elements.quickAddBtn) {
      this.elements.quickAddBtn.addEventListener('click', () => {
        this.quickAddEvent();
      });
    }
    
    // Mark complete button
    if (this.elements.markCompleteBtn) {
      this.elements.markCompleteBtn.addEventListener('click', () => {
        this.markTasksComplete();
      });
    }
  }

  /**
   * Switch between tabs in mobile view
   * @param {string} tab - The tab to switch to ('calendar' or 'upcoming')
   */
  switchTab(tab) {
    if (!this.elements.calendarTab || !this.elements.upcomingTab || 
        !this.elements.calendarColumn || !this.elements.upcomingColumn) {
      return;
    }
    
    if (tab === 'calendar') {
      this.elements.calendarTab.classList.add('active');
      this.elements.upcomingTab.classList.remove('active');
      this.elements.calendarColumn.classList.add('active');
      this.elements.upcomingColumn.classList.remove('active');
    } else {
      this.elements.calendarTab.classList.remove('active');
      this.elements.upcomingTab.classList.add('active');
      this.elements.calendarColumn.classList.remove('active');
      this.elements.upcomingColumn.classList.add('active');
    }
  }

  /**
   * Navigate to previous/next month
   * @param {number} direction - Direction to navigate (-1 for previous, 1 for next)
   */
  navigateMonth(direction) {
    const newDate = new Date(this.currentDate);
    newDate.setMonth(this.currentDate.getMonth() + direction);
    this.currentDate = newDate;
    this.updateCalendar();
    this.populateEvents();
  }

  /**
   * Update the calendar grid with days for current month
   */
  updateCalendar() {
    if (!this.elements.calendarGrid || !this.elements.currentMonthLabel) {
      return;
    }
    
    // Update month/year label
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    this.elements.currentMonthLabel.textContent = `${monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
    
    // Clear existing day cells (except headers)
    const dayHeaders = Array.from(this.elements.calendarGrid.querySelectorAll('.calendar-day-header'));
    this.elements.calendarGrid.innerHTML = '';
    
    // Add back the day headers
    dayHeaders.forEach(header => {
      this.elements.calendarGrid.appendChild(header);
    });
    
    // Get first day of month and total days
    const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
    const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
    
    // Add days from previous month to fill first row
    const firstDayOfWeek = firstDay.getDay();
    const prevMonth = new Date(this.currentDate);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const daysInPrevMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
    
    for (let i = 0; i < firstDayOfWeek; i++) {
      const day = daysInPrevMonth - firstDayOfWeek + i + 1;
      this.createDayCell(day, true);
    }
    
    // Add days of current month
    const today = new Date();
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const isToday = 
        i === today.getDate() && 
        this.currentDate.getMonth() === today.getMonth() && 
        this.currentDate.getFullYear() === today.getFullYear();
        
      this.createDayCell(i, false, isToday);
    }
    
    // Add days from next month to complete the grid
    const totalCellsFilled = firstDayOfWeek + lastDay.getDate();
    const cellsToAdd = 42 - totalCellsFilled; // Always show 6 rows (42 cells)
    
    for (let i = 1; i <= cellsToAdd; i++) {
      this.createDayCell(i, true);
    }
  }

  /**
   * Create a day cell in the calendar grid
   * @param {number} day - Day number
   * @param {boolean} isOtherMonth - Whether the day belongs to previous/next month
   * @param {boolean} isToday - Whether the day is today
   */
  createDayCell(day, isOtherMonth, isToday = false) {
    const dayElement = document.createElement('div');
    dayElement.classList.add('calendar-day');
    
    if (isOtherMonth) {
      dayElement.classList.add('other-month');
    }
    
    if (isToday) {
      dayElement.classList.add('today');
    }
    
    const dayNumber = document.createElement('div');
    dayNumber.classList.add('calendar-day-number');
    dayNumber.textContent = day;
    
    dayElement.appendChild(dayNumber);
    dayElement.addEventListener('click', () => {
      this.selectDate(day, isOtherMonth);
    });
    
    this.elements.calendarGrid.appendChild(dayElement);
    return dayElement;
  }

  /**
   * Select a date on the calendar
   * @param {number} day - Day number
   * @param {boolean} isOtherMonth - Whether the day belongs to previous/next month
   */
  selectDate(day, isOtherMonth) {
    const newDate = new Date(this.currentDate);
    
    if (isOtherMonth) {
      if (day > 20) {
        // It's from the previous month
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        // It's from the next month
        newDate.setMonth(newDate.getMonth() + 1);
      }
    }
    
    newDate.setDate(day);
    this.selectedDate = newDate;
    
    // Update the event form with selected date
    const eventDateInput = document.getElementById('eventDate');
    if (eventDateInput) {
      const formattedDate = this.formatDateForInput(this.selectedDate);
      eventDateInput.value = formattedDate;
    }
    
    // Highlight the selected day
    const allDays = this.elements.calendarGrid.querySelectorAll('.calendar-day');
    allDays.forEach(dayCell => {
      dayCell.classList.remove('selected');
    });
    
    // Find and highlight the clicked day
    const dayIndex = Array.from(allDays).findIndex(dayCell => {
      const dayNumber = parseInt(dayCell.querySelector('.calendar-day-number').textContent);
      return dayNumber === day && 
        (isOtherMonth === dayCell.classList.contains('other-month'));
    });
    
    if (dayIndex >= 0) {
      allDays[dayIndex].classList.add('selected');
    }
    
    // If it's another month, navigate to that month
    if (isOtherMonth) {
      this.currentDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
      this.updateCalendar();
      this.populateEvents();
    }
  }

  /**
   * Format date for input fields (YYYY-MM-DD)
   * @param {Date} date - Date to format
   * @returns {string} - Formatted date string
   */
  formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Load events from storage or API
   */
  /**
   * Load events from localStorage with fallback to demo data
   */
  async loadEvents() {
    if (this.eventsInitialized) return;
    
    try {
      // Try to load from localStorage
      const savedEvents = localStorage.getItem('pasha_scheduler_events');
      
      if (savedEvents) {
        // Parse the saved events
        const parsedEvents = JSON.parse(savedEvents);
        
        // If we have saved events, use those
        if (Array.isArray(parsedEvents) && parsedEvents.length > 0) {
          this.events = parsedEvents;
          this.eventsInitialized = true;
          return;
        }
      }
      
      // If no saved events or empty array, use demo data
      this.events = [
        {
          id: 'event_1',
          title: 'Product Team Meeting',
          start: new Date(2025, 4, 21, 10, 0).toISOString(), // May 21, 2025, 10:00 AM
          end: new Date(2025, 4, 21, 11, 30).toISOString(),
          type: 'meeting',
          location: 'Conference Room A',
          description: 'Weekly product team sync meeting',
          createdAt: new Date().toISOString()
        },
        {
          id: 'event_2',
          title: 'Flight to New York',
          start: new Date(2025, 4, 23, 14, 45).toISOString(),
          end: new Date(2025, 4, 23, 18, 20).toISOString(),
          type: 'travel',
          location: 'SFO to JFK, Flight AA123',
          description: 'Business trip to New York',
          createdAt: new Date().toISOString()
        },
        {
          id: 'event_3',
          title: 'Hotel Check-in',
          start: new Date(2025, 4, 23, 20, 0).toISOString(),
          end: new Date(2025, 4, 23, 20, 30).toISOString(),
          type: 'travel',
          location: 'Hilton Midtown, New York',
          description: 'Check in to hotel'
        },
        {
          id: 4,
          title: 'Client Meeting',
          start: new Date(2025, 4, 24, 9, 0),
          end: new Date(2025, 4, 24, 12, 0),
          type: 'meeting',
          location: 'Client Office, New York',
          description: 'Presentation of new product features'
        },
        {
          id: 5,
          title: 'Return Flight',
          start: new Date(2025, 4, 26, 15, 30),
          end: new Date(2025, 4, 26, 19, 15),
          type: 'travel',
          location: 'JFK to SFO, Flight AA456',
          description: 'Return flight from New York'
        },
        {
          id: 6,
          title: 'Dentist Appointment',
          start: new Date(2025, 4, 25, 9, 0),
          end: new Date(2025, 4, 25, 10, 0),
          type: 'personal',
          location: "Dr. Smith's Office",
          description: 'Regular checkup'
        }
      ];
      
      // Add tasks
      this.tasks = [
        {
          id: 101,
          title: 'Complete Project Presentation',
          due: new Date(2025, 4, 22),
          complete: false
        },
        {
          id: 102,
          title: 'Book Hotel for Conference',
          due: new Date(2025, 4, 21),
          complete: false
        }
      ];
      
      this.eventsInitialized = true;
    } catch (error) {
      console.error('Error loading events:', error);
    }
  }

  /**
   * Populate events in the calendar and lists
   */
  populateEvents() {
    this.populateCalendarEvents();
    this.populateEventLists();
  }

  /**
   * Populate events on the calendar
   */
  populateCalendarEvents() {
    if (!this.elements.calendarGrid || !this.events) return;
    
    // Clear existing event elements
    const existingEvents = this.elements.calendarGrid.querySelectorAll('.calendar-event');
    existingEvents.forEach(eventEl => eventEl.remove());
    
    // Add events to calendar days
    const dayCells = this.elements.calendarGrid.querySelectorAll('.calendar-day');
    
    this.events.forEach(event => {
      // Parse the start date from ISO string if needed
      const startDate = typeof event.start === 'string' ? new Date(event.start) : event.start;
      
      const eventMonth = startDate.getMonth();
      const eventYear = startDate.getFullYear();
      
      // Only show events for the current month view
      if (eventMonth === this.currentDate.getMonth() && eventYear === this.currentDate.getFullYear()) {
        const eventDay = startDate.getDate();
        
        // Find the corresponding day cell
        const dayIndex = Array.from(dayCells).findIndex(dayCell => {
          if (dayCell.classList.contains('other-month')) return false;
          const dayNumber = parseInt(dayCell.querySelector('.calendar-day-number').textContent);
          return dayNumber === eventDay;
        });
        
        if (dayIndex >= 0) {
          const eventElement = document.createElement('div');
          eventElement.classList.add('calendar-event');
          eventElement.textContent = event.title;
          
          if (event.type) {
            eventElement.classList.add(event.type);
          }
          
          eventElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showEventDetails(event);
          });
          
          dayCells[dayIndex].appendChild(eventElement);
        }
      }
    });
  }

  /**
   * Populate event lists (upcoming events, travel plans)
   */
  populateEventLists() {
    if (!this.events) return;
    
    try {
      // Sort events by start time
      const sortedEvents = [...this.events].sort((a, b) => {
        const dateA = new Date(a.start);
        const dateB = new Date(b.start);
        return dateA - dateB;
      });
      
      // Filter for upcoming events (starting from today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const upcomingEvents = sortedEvents.filter(event => {
        const eventStart = new Date(event.start);
        return eventStart >= today;
      });
      
      const travelEvents = upcomingEvents.filter(event => event.type === 'travel');
      
      // Generate upcoming events list
      const upcomingList = document.querySelector('.event-list');
      if (upcomingList) {
        // Clear the list
        upcomingList.innerHTML = '';
        
        if (upcomingEvents.length === 0) {
          // Show a message if no events
          const noEventsItem = document.createElement('li');
          noEventsItem.className = 'event-item';
          noEventsItem.innerHTML = '<div class="event-content"><h4 class="event-title">No upcoming events</h4><div class="event-time">Add an event using the form on the left</div></div>';
          upcomingList.appendChild(noEventsItem);
        } else {
          // Add actual events
          upcomingEvents.slice(0, 5).forEach(event => {
            const listItem = document.createElement('li');
            listItem.classList.add('event-item');
            
            const indicator = document.createElement('div');
            indicator.classList.add('event-indicator');
            if (event.type) {
              indicator.classList.add(event.type);
            }
            
            const content = document.createElement('div');
            content.classList.add('event-content');
            
            const title = document.createElement('h4');
            title.classList.add('event-title');
            title.textContent = event.title;
            
            const startDate = new Date(event.start);
            const endDate = new Date(event.end);
            
            const timeDiv = document.createElement('div');
            timeDiv.classList.add('event-time');
            
            const dateOptions = { month: 'short', day: 'numeric', year: 'numeric' };
            const timeOptions = { hour: 'numeric', minute: 'numeric', hour12: true };
            
            const formattedDate = startDate.toLocaleDateString('en-US', dateOptions);
            const startTime = startDate.toLocaleTimeString('en-US', timeOptions);
            const endTime = endDate.toLocaleTimeString('en-US', timeOptions);
            
            timeDiv.innerHTML = `<i class="fas fa-clock event-icon"></i> ${formattedDate}, ${startTime} - ${endTime}`;
            
            const locationDiv = document.createElement('div');
            locationDiv.classList.add('event-location');
            
            if (event.location) {
              locationDiv.innerHTML = `<i class="fas fa-map-marker-alt event-icon"></i> ${event.location}`;
            }
            
            content.appendChild(title);
            content.appendChild(timeDiv);
            content.appendChild(locationDiv);
            
            listItem.appendChild(indicator);
            listItem.appendChild(content);
            
            upcomingList.appendChild(listItem);
          });
        }
      }
      
      // TODO: Implement travel plans list population when needed
    } catch (error) {
      console.error('Error populating event lists:', error);
    }
  }

  /**
   * Save events to localStorage
   */
  saveEvents() {
    try {
      localStorage.setItem('pasha_scheduler_events', JSON.stringify(this.events));
    } catch (error) {
      console.error('Error saving events to localStorage:', error);
      this.showNotification('Failed to save your events', 'error');
    }
  }

  /**
   * Create an event list item
   * @param {Object} event - Event object
   * @returns {HTMLElement} - Event list item element
   */
  createEventListItem(event) {
    const listItem = document.createElement('li');
    listItem.classList.add('event-item');
    
    const indicator = document.createElement('div');
    indicator.classList.add('event-indicator');
    if (event.type) {
      indicator.classList.add(event.type);
    }
    
    const content = document.createElement('div');
    content.classList.add('event-content');
    
    const title = document.createElement('h4');
    title.classList.add('event-title');
    title.textContent = event.title;
    
    const time = document.createElement('div');
    time.classList.add('event-time');
    time.innerHTML = `<i class="fas fa-clock event-icon"></i> ${this.formatEventTime(event)}`;
    
    const location = document.createElement('div');
    location.classList.add('event-location');
    location.innerHTML = `<i class="fas fa-map-marker-alt event-icon"></i> ${event.location || 'No location'}`;
    
    content.appendChild(title);
    content.appendChild(time);
    content.appendChild(location);
    
    listItem.appendChild(indicator);
    listItem.appendChild(content);
    
    listItem.addEventListener('click', () => {
      this.showEventDetails(event);
    });
    
    return listItem;
  }

  /**
   * Format event time for display
   * @param {Object} event - Event object
   * @returns {string} - Formatted time string
   */
  formatEventTime(event) {
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    // Parse start date from ISO string if needed
    const start = typeof event.start === 'string' ? new Date(event.start) : event.start;
    const startStr = start.toLocaleString('en-US', options);
    
    if (event.end) {
      // Parse end date from ISO string if needed
      const end = typeof event.end === 'string' ? new Date(event.end) : event.end;
      const endTime = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return `${startStr} - ${endTime}`;
    }
    
    return startStr;
  }

  /**
   * Create a new event from form data
   */
  /**
   * Create or update an event from the form data
   */
  createNewEvent() {
    const form = this.elements.newEventForm;
    if (!form) return;
    
    const title = document.getElementById('eventTitle').value;
    const dateStr = document.getElementById('eventDate').value;
    const startStr = document.getElementById('eventStart').value;
    const endStr = document.getElementById('eventEnd').value;
    const type = document.getElementById('eventType').value;
    const location = document.getElementById('eventLocation').value;
    const description = document.getElementById('eventDescription').value;
    
    if (!title || !dateStr || !startStr) {
      this.showNotification('Please fill in the required fields (Title, Date, Start Time)', 'error');
      return;
    }
    
    try {
      // Parse date and time
      const [year, month, day] = dateStr.split('-').map(Number);
      const [startHours, startMinutes] = startStr.split(':').map(Number);
      
      const start = new Date(year, month - 1, day, startHours, startMinutes);
      
      let end;
      if (endStr) {
        const [endHours, endMinutes] = endStr.split(':').map(Number);
        end = new Date(year, month - 1, day, endHours, endMinutes);
        
        // Validate end time is after start time
        if (end <= start) {
          this.showNotification('End time must be after start time', 'error');
          return;
        }
      } else {
        // Default to 1 hour later
        end = new Date(start);
        end.setHours(end.getHours() + 1);
      }
      
      // Check if we're editing an existing event
      const isEditing = this.editingEventId !== undefined && this.editingEventId !== null;
      let event;
      
      if (isEditing) {
        // Find the existing event
        const eventIndex = this.events.findIndex(e => e.id == this.editingEventId);
        
        if (eventIndex === -1) {
          this.showNotification('Event not found, creating a new one', 'info');
          // Create a new event if not found
          event = {
            id: `event_${Date.now()}`,
            createdAt: new Date().toISOString()
          };
          this.events.push(event);
        } else {
          // Update the existing event
          event = this.events[eventIndex];
          // Keep the original creation date
          const createdAt = event.createdAt;
          
          // Update the event with new data
          event = {
            ...event,
            title,
            start: start.toISOString(),
            end: end.toISOString(),
            type,
            location,
            description,
            updatedAt: new Date().toISOString(),
            createdAt // Keep original creation date
          };
          
          this.events[eventIndex] = event;
        }
      } else {
        // Create new event
        event = {
          id: `event_${Date.now()}`,
          title,
          start: start.toISOString(),
          end: end.toISOString(),
          type,
          location,
          description,
          createdAt: new Date().toISOString()
        };
        
        // Add to events array
        this.events.push(event);
      }
      
      // Save to localStorage
      this.saveEvents();
      
      // Update calendar and lists
      this.updateCalendar();
      this.populateEvents();
      
      // Reset the form and clear editing state
      if (isEditing) {
        this.cancelEdit();
      } else {
        // Reset form
        form.reset();
        
        // Set today's date in the form
        const eventDateInput = document.getElementById('eventDate');
        if (eventDateInput) {
          const today = new Date();
          const formattedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
          eventDateInput.value = formattedDate;
        }
        
        // Focus back on the title field for quick addition of another event
        document.getElementById('eventTitle').focus();
      }
      
      // Show confirmation
      const message = isEditing ? 'Event updated successfully!' : 'Event created successfully!';
      this.showNotification(message, 'success');
    } catch (error) {
      console.error('Error creating/updating event:', error);
      this.showNotification('An error occurred while saving the event', 'error');
    }
  }
  
  /**
   * Edit an existing event
   * @param {Object} event - Event to edit
   */
  editEvent(event) {
    // Populate the form with existing event data
    const eventTitleInput = document.getElementById('eventTitle');
    const eventDateInput = document.getElementById('eventDate');
    const eventStartInput = document.getElementById('eventStart');
    const eventEndInput = document.getElementById('eventEnd');
    const eventTypeInput = document.getElementById('eventType');
    const eventLocationInput = document.getElementById('eventLocation');
    const eventDescriptionInput = document.getElementById('eventDescription');
    
    if (!eventTitleInput || !eventDateInput || !eventStartInput) {
      this.showNotification('Unable to edit event, form elements not found', 'error');
      return;
    }
    
    try {
      // Parse dates from ISO strings if needed
      const start = typeof event.start === 'string' ? new Date(event.start) : event.start;
      const end = event.end ? (typeof event.end === 'string' ? new Date(event.end) : event.end) : null;
      
      // Format date for the date input (YYYY-MM-DD)
      const year = start.getFullYear();
      const month = String(start.getMonth() + 1).padStart(2, '0');
      const day = String(start.getDate()).padStart(2, '0');
      const dateValue = `${year}-${month}-${day}`;
      
      // Format times for the time inputs (HH:MM)
      const startHours = String(start.getHours()).padStart(2, '0');
      const startMinutes = String(start.getMinutes()).padStart(2, '0');
      const startValue = `${startHours}:${startMinutes}`;
      
      let endValue = '';
      if (end) {
        const endHours = String(end.getHours()).padStart(2, '0');
        const endMinutes = String(end.getMinutes()).padStart(2, '0');
        endValue = `${endHours}:${endMinutes}`;
      }
      
      // Fill the form
      eventTitleInput.value = event.title || '';
      eventDateInput.value = dateValue;
      eventStartInput.value = startValue;
      eventEndInput.value = endValue;
      if (eventTypeInput) eventTypeInput.value = event.type || 'meeting';
      if (eventLocationInput) eventLocationInput.value = event.location || '';
      if (eventDescriptionInput) eventDescriptionInput.value = event.description || '';
      
      // Store the ID of the event being edited
      this.editingEventId = event.id;
      
      // Change button text to update
      const submitButton = this.elements.newEventForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.textContent = 'Update Event';
        submitButton.dataset.editing = 'true';
      }
      
      // Scroll to the form
      this.elements.newEventForm.scrollIntoView({ behavior: 'smooth' });
      
      // Focus on the title input
      eventTitleInput.focus();
      
      // Add a cancel button if not already present
      if (!document.getElementById('cancelEditBtn')) {
        const cancelButton = document.createElement('button');
        cancelButton.id = 'cancelEditBtn';
        cancelButton.type = 'button';
        cancelButton.className = 'cancel-edit-btn';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => this.cancelEdit());
        
        submitButton.parentNode.insertBefore(cancelButton, submitButton.nextSibling);
      }
      
    } catch (error) {
      console.error('Error editing event:', error);
      this.showNotification('Failed to edit event', 'error');
    }
  }
  
  /**
   * Cancel the edit operation
   */
  cancelEdit() {
    // Reset form
    this.elements.newEventForm.reset();
    
    // Reset button text
    const submitButton = this.elements.newEventForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.textContent = 'Schedule Event';
      submitButton.dataset.editing = 'false';
    }
    
    // Remove cancel button
    const cancelButton = document.getElementById('cancelEditBtn');
    if (cancelButton) {
      cancelButton.remove();
    }
    
    // Clear editing ID
    this.editingEventId = null;
    
    // Set today's date in the form
    const eventDateInput = document.getElementById('eventDate');
    if (eventDateInput) {
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
      eventDateInput.value = formattedDate;
    }
  }

  /**
   * Delete an event
   * @param {string|number} eventId - ID of the event to delete
   */
  deleteEvent(eventId) {
    if (!eventId) return;
    
    try {
      // Find the event index
      const eventIndex = this.events.findIndex(e => e.id == eventId);
      
      if (eventIndex === -1) {
        this.showNotification('Event not found', 'error');
        return;
      }
      
      // Remove the event
      this.events.splice(eventIndex, 1);
      
      // Save changes
      this.saveEvents();
      
      // Update UI
      this.updateCalendar();
      this.populateEvents();
      
      this.showNotification('Event deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting event:', error);
      this.showNotification('Failed to delete event', 'error');
    }
  }
  
  /**
   * Display a notification message
   * @param {string} message - The message to display
   * @param {string} type - The type of notification ('success', 'error', 'info')
   */
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.classList.add('scheduler-notification', `notification-${type}`);
    notification.textContent = message;
    
    // Add to body
    document.body.appendChild(notification);
    
    // Show with animation
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // Remove after delay
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }

  /**
   * Quick add an event with minimal details
   */
  quickAddEvent() {
    const title = prompt('Enter event title:');
    if (!title) return;
    
    const now = new Date();
    
    // Create quick event
    const newEvent = {
      id: Date.now(),
      title,
      start: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0),
      end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0),
      type: 'meeting',
      location: '',
      description: 'Quick added event'
    };
    
    // Add to events array
    this.events.push(newEvent);
    
    // Update calendar and lists
    this.populateEvents();
    
    // Show confirmation
    alert('Quick event added successfully!');
  }

  /**
   * Show details for a specific event
   * @param {Object} event - Event object
   */
  showEventDetails(event) {
    try {
      // Parse dates from ISO strings if needed
      const start = typeof event.start === 'string' ? new Date(event.start) : event.start;
      const end = event.end ? (typeof event.end === 'string' ? new Date(event.end) : event.end) : null;
      
      // Format dates for display
      const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const timeOptions = { hour: 'numeric', minute: 'numeric', hour12: true };
      
      const dateStr = start.toLocaleDateString('en-US', dateOptions);
      const startTimeStr = start.toLocaleTimeString('en-US', timeOptions);
      const endTimeStr = end ? end.toLocaleTimeString('en-US', timeOptions) : '';
      
      // Create a more visually appealing modal-like dialog
      const detailsModal = document.createElement('div');
      detailsModal.className = 'event-details-modal';
      detailsModal.innerHTML = `
        <div class="event-details-content">
          <div class="event-details-header ${event.type || 'default'}">
            <h3>${event.title}</h3>
            <button class="event-details-close">&times;</button>
          </div>
          <div class="event-details-body">
            <p><strong>Date:</strong> ${dateStr}</p>
            <p><strong>Time:</strong> ${startTimeStr}${endTimeStr ? ' - ' + endTimeStr : ''}</p>
            <p><strong>Location:</strong> ${event.location || 'No location'}</p>
            <p><strong>Type:</strong> ${event.type ? event.type.charAt(0).toUpperCase() + event.type.slice(1) : 'General'}</p>
            ${event.description ? `<div class="event-description"><strong>Description:</strong><p>${event.description}</p></div>` : ''}
          </div>
          <div class="event-details-footer">
            <button class="event-edit-btn">Edit</button>
            <button class="event-delete-btn">Delete</button>
          </div>
        </div>
      `;
      
      // Add to body and show
      document.body.appendChild(detailsModal);
      
      // Show with animation
      setTimeout(() => {
        detailsModal.classList.add('show');
      }, 10);
      
      // Setup close functionality
      const closeBtn = detailsModal.querySelector('.event-details-close');
      const closeModal = () => {
        detailsModal.classList.remove('show');
        setTimeout(() => {
          detailsModal.remove();
        }, 300);
      };
      
      closeBtn.addEventListener('click', closeModal);
      detailsModal.addEventListener('click', (e) => {
        if (e.target === detailsModal) {
          closeModal();
        }
      });
      
      // Handle edit button
      const editBtn = detailsModal.querySelector('.event-edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          this.editEvent(event);
          closeModal();
        });
      }
      
      // Handle delete button
      const deleteBtn = detailsModal.querySelector('.event-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          if (confirm('Are you sure you want to delete this event?')) {
            this.deleteEvent(event.id);
            closeModal();
          }
        });
      }
      
      // Close on Escape key
      document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
          closeModal();
          document.removeEventListener('keydown', escHandler);
        }
      });
    } catch (error) {
      console.error('Error showing event details:', error);
      alert(`Event: ${event.title}\nUnable to show full details.`);
    }
  }

  /**
   * Mark selected tasks as complete
   */
  markTasksComplete() {
    // In a real app, you would implement task completion
    alert('Tasks marked as complete!');
  }

  /**
   * Open the scheduler modal
   */
  openScheduler() {
    if (!this.elements.modal) return;
    
    this.elements.modal.classList.add('active');
    
    // Focus the close button for accessibility
    if (this.elements.closeBtn) {
      setTimeout(() => this.elements.closeBtn.focus(), 100);
    }
    
    // Initialize if not already done
    if (!this.initialized) {
      this.init();
    } else {
      // Refresh calendar and events when reopening
      this.updateCalendar();
      this.loadEvents().then(() => {
        this.populateEvents();
      });
    }
    
    // Set today's date in the event form
    const eventDateInput = document.getElementById('eventDate');
    if (eventDateInput) {
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
      eventDateInput.value = formattedDate;
    }
  }

  /**
   * Close the scheduler modal
   */
  closeScheduler() {
    if (!this.elements.modal) return;
    
    this.elements.modal.classList.add('fadeOut');
    setTimeout(() => {
      this.elements.modal.classList.remove('active');
      this.elements.modal.classList.remove('fadeOut');
    }, 300);
  }
}

// Make SchedulerController available globally
// Using both ways to expose the class to handle different module contexts
window.SchedulerController = SchedulerController;
// Ensure it works in all contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SchedulerController };
}
