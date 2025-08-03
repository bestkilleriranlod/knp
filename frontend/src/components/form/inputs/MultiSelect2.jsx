import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import axios from 'axios'

export default function BasicSelect({ onChange, defaultValue, id, disabled }) {
  const [age, setAge] = useState(defaultValue)
  const [countries, setCountries] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const handleChange = (event) => {
    setAge(event.target.value)
    if (onChange) {
      onChange(event.target.value)
    }
  }

  useEffect(() => {
    setAge(defaultValue)
  }, [defaultValue])
  
  useEffect(() => {
    async function fetchCountriesData() {
      setIsLoading(true)
      try {
        const access_token = sessionStorage.getItem("access_token")
        const agent = JSON.parse(sessionStorage.getItem("agent"))
        
        // دریافت پنل‌ها برای بررسی ظرفیت
        const panelsResponse = await axios.post("/get_panels", { access_token })
        const panels = Array.isArray(panelsResponse.data) ? panelsResponse.data : []
        
        // دریافت کاربران برای بررسی تعداد کاربران هر کشور
        const usersResponse = await axios.post("/get_users", { access_token })
        const users = usersResponse.data && usersResponse.data.obj_arr ? usersResponse.data.obj_arr : []
        
        // محاسبه تعداد کاربران هر کشور
        const countryUsersCount = {}
        users.forEach(user => {
          if (user.country) {
            if (!countryUsersCount[user.country]) {
              countryUsersCount[user.country] = 0
            }
            countryUsersCount[user.country]++
          }
        })
        
        // ایجاد آرایه کشورها با وضعیت پر بودن
        const countriesWithStatus = agent.country.split(",").map(country => {
          const panel = panels.find(p => p.panel_country === country)
          let isFull = false
          
          if (panel) {
            // اگر panel_user_max_count وجود داشته باشد از آن استفاده می‌کنیم
            if (panel.panel_user_max_count) {
              const usersCount = countryUsersCount[country] || 0
              isFull = usersCount >= panel.panel_user_max_count
            } 
            // اگر active_users وجود داشته باشد از آن استفاده می‌کنیم
            else if (panel.active_users !== undefined && panel.panel_user_max_count !== undefined) {
              isFull = panel.active_users >= panel.panel_user_max_count
            }
            
            // اگر پنل غیرفعال است، کشور پر در نظر گرفته می‌شود
            if (panel.disable === true) {
              isFull = true
            }
          }
          
          return {
            name: country,
            isFull
          }
        })
        
        setCountries(countriesWithStatus)
      } catch (error) {
        console.error("Error fetching countries data:", error)
        // در صورت خطا، از اطلاعات کاربر استفاده می‌کنیم
        const agent = JSON.parse(sessionStorage.getItem("agent"))
        if (agent && agent.country) {
          setCountries(agent.country.split(",").map(country => ({ name: country, isFull: false })))
        }
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchCountriesData()
  }, [])

  // فقط برای مواردی که اطلاعات کشورها هنوز بارگذاری نشده است از اطلاعات agent استفاده می‌کنیم
  const agent = JSON.parse(sessionStorage.getItem("agent"))

  return (
    <Box sx={{ width: '100%' }}>
      <FormControl fullWidth>
        <InputLabel id="demo-simple-select-label">{isLoading ? 'Loading...' : ''}</InputLabel>
        <Select sx={{ height: 34 }}
          labelId="demo-simple-select-label"
          id={id}
          value={age}
          label={isLoading ? 'Loading...' : ''}
          onChange={handleChange}
          disabled={disabled}
        >
          {countries.length > 0 ? (
            countries.map((country) => (
              <MenuItem 
                key={country.name} 
                value={country.name}
                disabled={country.isFull}
                sx={country.isFull ? { 
                  opacity: 0.6, 
                  '&:hover': { backgroundColor: 'transparent' },
                  display: 'flex',
                  justifyContent: 'space-between'
                } : {}}
              >
                {country.name}
                {country.isFull && (
                  <span style={{ 
                    marginLeft: '8px', 
                    color: '#ff5252',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    padding: '1px 4px',
                    border: '1px solid #ff5252',
                    borderRadius: '3px'
                  }}>Full</span>
                )}
              </MenuItem>
            ))
          ) : (
            agent && agent.country && agent.country.split(",").map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))
          )}
        </Select>
      </FormControl>
    </Box>
  )
}
